/* eslint-disable no-console */
const axios = require("axios");

class JiraIntegration {
  constructor(baseUrl, username, apiToken) {
    if (!baseUrl || !username || !apiToken) {
      console.error("Jira configuration is incomplete. Please provide all required parameters.");
      throw new Error("Incomplete Jira configuration");
    }

    this.baseUrl = baseUrl;
    this.username = username;
    this.apiToken = apiToken;

    console.log("Jira Integration initialized with:");
    console.log(`Base URL: ${this.baseUrl}`);
    console.log(`Username: ${this.username}`);
    console.log(`API Token: ${this.apiToken ? "[REDACTED]" : "Not set"}`);
  }

  async executeJiraQuery(jql) {
    const url = `${this.baseUrl}/rest/api/3/search`;

    try {
      console.log(`Sending request to Jira API: ${url}`);
      console.log(`JQL query: ${jql}`);

      const response = await axios.get(url, {
        params: {
          jql: jql,
          maxResults: 0
        },
        auth: {
          username: this.username,
          password: this.apiToken
        },
        headers: {
          "Accept": "application/json"
        }
      });

      console.log(`Jira API response status: ${response.status}`);
      console.log(`Jira API response data: ${JSON.stringify(response.data)}`);

      return `There are ${response.data.total} issues matching the criteria.`;
    } catch (error) {
      console.error(`Error fetching Jira issues: ${error.message}`);
      if (error.response) {
        console.error(`Response status: ${error.response.status}`);
        console.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  async handleJiraQuery(query) {
    try {
      // For simplicity, we're assuming the query is already in JQL format
      // In a more complex scenario, you might want to parse the natural language query to JQL
      const result = await this.executeJiraQuery(query);
      return result;
    } catch (error) {
      console.error("Error handling Jira query:", error);
      return `An error occurred while processing your Jira query: ${error.message}`;
    }
  }
}

module.exports = JiraIntegration;