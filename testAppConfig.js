const { AppConfigurationClient } = require("@azure/app-configuration");

// Define your connection string
const connectionString = "Endpoint=https://zyptai-dev-app-config.azconfig.io;Id=3b6Y;Secret=jQtx75kcpqsoAisGd4E8VHaaXFU5SODG8jAR4oQ2fg6LUtzCfALZJQQJ99AKACYeBjFWafWYAAACAZAC4Ncv";

async function getAppConfigurations() {
  try {
    // Create a client
    const client = new AppConfigurationClient(connectionString);

    console.log("Connecting to Azure App Configuration...");

    // Retrieve all configurations
    const configurations = client.listConfigurationSettings();

    console.log("Retrieved configurations:");
    for await (const setting of configurations) {
      console.log(`Key: ${setting.key}, Value: ${setting.value}`);
    }
  } catch (error) {
    console.error("Error retrieving configurations:", error.message);
  }
}

getAppConfigurations();
