import fs from 'fs';
import path from 'path';
import os from 'os';
import open from 'open';
import https from 'https';

export class CopilotAuth {
  constructor(lspClient) {
    this.lspClient = lspClient;

    // Define the config path based on XDG spec, fallback to default locations
    this.configPath = process.env.XDG_CONFIG_HOME ||
      (os.platform() === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Local', 'github-copilot')
        : path.join(os.homedir(), '.config', 'github-copilot'));

    // Define paths for token files
    this.hostsPath = fs.existsSync(path.join(this.configPath, 'hosts.json'))
      ? path.join(this.configPath, 'hosts.json')
      : path.join(this.configPath, 'apps.json');
    this.githubTokenPath = path.join(this.configPath, 'github-token.json');

    // Ensure the config directory exists
    this.ensureConfigDir();
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true });
    }
  }

  async signIn() {
    try {
      // Step 1: Check if already authenticated
      const status = await this.checkStatus();

      if (status.user) {
        console.log(`Already signed in as GitHub user: ${status.user}`);

        // Even if already signed in, we should get and store the GitHub token
        await this.fetchAndStoreGitHubToken();

        return { success: true, user: status.user };
      }

      // Step 2: Initiate sign in process
      const signInResponse = await this.lspClient.request('signInInitiate', {});

      if (!signInResponse.userCode || !signInResponse.verificationUri) {
        throw new Error('Invalid sign in response from Copilot');
      }

      const { userCode, verificationUri } = signInResponse;

      // Step 3: Display the code to the user and open browser
      console.log('\n=== GitHub Copilot Authentication ===');
      console.log(`Your one-time code: ${userCode}`);
      console.log(`Please visit: ${verificationUri}`);
      console.log('Enter the code there to authenticate with GitHub Copilot');
      console.log('Waiting for authentication to complete...\n');

      // Open the verification URL in browser
      await open(verificationUri);

      // Step 4: Confirm the sign-in
      const confirmResponse = await this.lspClient.request('signInConfirm', { userCode });

      if (confirmResponse.status.toLowerCase() !== 'ok') {
        throw new Error(`Authentication failed: ${confirmResponse.error?.message || 'Unknown error'}`);
      }

      console.log(`Successfully authenticated as GitHub user: ${confirmResponse.user}`);

      // Step 5: Fetch and store the GitHub token
      await this.fetchAndStoreGitHubToken();

      // Get the final status to confirm we're signed in
      const finalStatus = await this.checkStatus();

      return {
        success: true,
        user: finalStatus.user
      };
    } catch (error) {
      console.error('Error during sign in:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Fetch the GitHub token using the OAuth token from hosts.json
   * and store it in github_token.json
   */
  async fetchAndStoreGitHubToken() {
    try {
      console.log('Fetching GitHub token...');

      // Step 1: Get the OAuth token from hosts.json
      if (!fs.existsSync(this.hostsPath)) {
        throw new Error('Hosts file not found. Authentication may not be complete.');
      }

      const hostsContent = fs.readFileSync(this.hostsPath, 'utf8');
      const hosts = JSON.parse(hostsContent);

      // Find the OAuth token in the hosts file
      let oauthToken = null;
      for (const key in hosts) {
        if (key.startsWith('github.com:') && hosts[key].oauth_token) {
          oauthToken = hosts[key].oauth_token;
          break;
        }
      }

      if (!oauthToken) {
        throw new Error('OAuth token not found in hosts file');
      }

      console.log('OAuth token found, requesting GitHub token...');

      // Step 2: Get GitHub token using the OAuth token
      const tokenData = await this.requestGitHubToken(oauthToken);

      // Step 3: Store the token
      fs.writeFileSync(
        this.githubTokenPath,
        JSON.stringify(tokenData, null, 2),
        'utf8'
      );

      console.log('GitHub token stored successfully');
      return true;
    } catch (error) {
      console.error('Failed to fetch or store GitHub token:', error);
      return false;
    }
  }

  /**
   * Make a request to GitHub API to get a token
   * @param {string} oauthToken - The OAuth token from hosts.json
   */
  requestGitHubToken(oauthToken) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/copilot_internal/v2/token',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${oauthToken}`,
          'User-Agent': 'github-copilot/2.0',
          'Accept': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const tokenData = JSON.parse(data);
              resolve(tokenData);
            } catch (error) {
              reject(new Error(`Failed to parse GitHub API response: ${error.message}`));
            }
          } else {
            reject(new Error(`GitHub API returned status code ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Error making request to GitHub API: ${error.message}`));
      });

      req.end();
    });
  }

  async signOut() {
    try {
      // Check current status
      const status = await this.checkStatus({ options: { localChecksOnly: true } });

      if (!status.user) {
        console.log('Not currently signed in');
        return { success: true };
      }

      // Sign out
      await this.lspClient.request('signOut', {});

      // Remove GitHub token file
      if (fs.existsSync(this.githubTokenPath)) {
        fs.unlinkSync(this.githubTokenPath);
      }

      console.log(`Signed out from GitHub Copilot as user: ${status.user}`);
      return {
        success: true,
        previousUser: status.user
      };
    } catch (error) {
      console.error('Error during sign out:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async checkStatus(params = {}) {
    try {
      // Step 1: Check with LSP client (as it does now)
      const lspStatus = await this.lspClient.request('checkStatus', params);

      // Track status for the comprehensive response
      let status = {
        status: lspStatus.status || 'Unknown',
        user: lspStatus.user || null,
        lspAuthenticated: lspStatus.user ? true : false
      };

      // Step 2: Check if the GitHub token file exists
      const githubTokenExists = fs.existsSync(this.githubTokenPath);
      status.githubTokenExists = githubTokenExists;

      // Step 3: Check if the GitHub token has expired
      if (githubTokenExists) {
        try {
          const tokenContent = fs.readFileSync(this.githubTokenPath, 'utf8');
          const tokenData = JSON.parse(tokenContent);

          if (tokenData.expires_at) {
            // Parse the expiration date
            const expiresAt = new Date(tokenData.expires_at * 1000);
            const now = new Date();
            console.log(`GitHub token expires at: ${expiresAt}`);
            console.log(`Current time: ${now}`);

            // Check if token has expired
            status.tokenExpired = now >= expiresAt;

            // Calculate time left before expiration
            if (!status.tokenExpired) {
              const timeLeftMs = expiresAt.getTime() - now.getTime();
              const timeLeftHours = Math.floor(timeLeftMs / (1000 * 60 * 60));
              status.tokenExpiresIn = timeLeftHours > 24 ?
                `${Math.floor(timeLeftHours / 24)} days` :
                `${timeLeftHours} hours`;
            } else {
              status.tokenExpiresIn = 'Expired';
            }
          } else {
            status.tokenExpired = false; // Can't determine if no expires_at field
            status.tokenExpiresIn = 'Unknown';
          }

          // Store GitHub token validity
          status.validGitHubToken = !status.tokenExpired;
        } catch (error) {
          console.error('Error parsing GitHub token:', error);
          status.validGitHubToken = false;
          status.tokenError = error.message;
        }
      } else {
        status.validGitHubToken = false;
        status.tokenExpired = true;
      }

      // Determine overall authentication status
      status.authenticated = status.lspAuthenticated && status.validGitHubToken;

      // If token is expired but LSP says we're authenticated, try to refresh
      if (status.lspAuthenticated && status.tokenExpired && !params.skipTokenRefresh) {
        console.log('GitHub token expired, attempting to refresh...');
        const refreshed = await this.fetchAndStoreGitHubToken();

        if (refreshed) {
          // Check status again with token refresh skipped to avoid infinite loop
          return await this.checkStatus({ ...params, skipTokenRefresh: true });
        }
      }

      return status;
    } catch (error) {
      console.error('Error checking status:', error);
      return {
        status: 'Error',
        error: error.message,
        authenticated: false,
        lspAuthenticated: false,
        validGitHubToken: false
      };
    }
  }

  getCredentials() {
    try {
      // Read the hosts.json file where credentials are stored
      if (!fs.existsSync(this.hostsPath)) {
        return null;
      }

      const hostsContent = fs.readFileSync(this.hostsPath, 'utf8');
      const hosts = JSON.parse(hostsContent);

      // Extract the OAuth token
      let oauthToken = null;
      let username = null;

      for (const key in hosts) {
        if (key.startsWith('github.com:') && hosts[key].oauth_token) {
          oauthToken = hosts[key].oauth_token;
          username = hosts[key].user;
          break;
        }
      }

      // If we have a GitHub token file, read that as well
      let githubToken = null;
      if (fs.existsSync(this.githubTokenPath)) {
        const tokenContent = fs.readFileSync(this.githubTokenPath, 'utf8');
        const tokenData = JSON.parse(tokenContent);
        githubToken = tokenData.token || null;
      }

      if (oauthToken || githubToken) {
        return {
          oauthToken,
          githubToken,
          username
        };
      }

      return null;
    } catch (error) {
      console.error('Error getting credentials:', error);
      return null;
    }
  }
}

export default CopilotAuth;
