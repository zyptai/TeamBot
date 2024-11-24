/* eslint-disable no-console */
// Copyright (c) 2024 ZyptAI, tim.barrow@zyptai.com
// This software is proprietary to ZyptAI.
// File: /imageAnalysis.js

const axios = require("axios");
const { OpenAIClient } = require("@azure/openai");
const { AzureKeyCredential } = require("@azure/core-auth");
const { MicrosoftAppCredentials } = require("botframework-connector");
const config = require("../config");
const LoggingUtil = require("./loggingUtil");
const appInsightsConfig = require('./utils/appInsightsConfig');

// Initialize the OpenAI client
const client = new OpenAIClient(
  config.azureOpenAIEndpoint, 
  new AzureKeyCredential(config.azureOpenAIKey)
);

/**
 * Creates a new logger instance
 * @returns {LoggingUtil} A new logger instance
 */
function createLogger() {
    return new LoggingUtil(appInsightsConfig.client);
}

/**
 * Function to analyze images using GPT-4.
 * @param {Buffer} imageBuffer - The buffer of the image file.
 * @param {String} userPrompt - The prompt or instruction to analyze the image.
 * @param {LoggingUtil} [logger] - The logger instance
 * @returns {Promise<String>} - The analysis result from GPT-4.
 */
async function analyzeImageWithGPT(imageBuffer, userPrompt, logger) {
  // Create logger if not provided
  if (!logger) {
    logger = createLogger();
  }
  const startTime = Date.now();
  try {
    logger.logEvent('GPT_ANALYSIS_START', {
      promptLength: userPrompt.length,
      imageSizeBytes: imageBuffer.length
    });
    const fullEndpoint = `${config.azureOpenAIEndpoint}/openai/deployments/${config.azureOpenAIDeploymentName}/chat/completions?api-version=2024-02-15-preview`;
    const base64Image = imageBuffer.toString("base64");
    const payload = {
      messages: [
        {
          role: "system",
          content: "You are an AI that analyzes images and provides detailed descriptions."
        },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}` } }
          ]
        }
      ],
      max_tokens: 150,
      temperature: 0.1
    };

    const response = await axios.post(fullEndpoint, payload, {
      headers: {
        "Content-Type": "application/json",
        "api-key": config.azureOpenAIKey
      }
    });

    // Log successful GPT analysis
    logger.logOperation('GPT_ANALYSIS', Date.now() - startTime, true, {
      promptLength: userPrompt.length,
      responseLength: response.data.choices[0].message.content.length,
      tokensUsed: response.data.usage?.total_tokens
    });
    return response.data.choices[0].message.content.trim();
  } catch (error) {
        // Log failed GPT analysis
        logger.logError(error, 'GPT_ANALYSIS', {
          promptLength: userPrompt.length,
          imageSizeBytes: imageBuffer.length,
          duration: Date.now() - startTime
        });
    throw error;
  }
}

/**
 * Function to download an image from a URL.
 * @param {String} contentUrl - The URL of the image to download.
 * @param {LoggingUtil} logger - The logger instance for monitoring
 * @returns {Promise<Buffer>} - The image file in a Buffer.
 */
async function downloadImage(contentUrl, logger) {
  if (!logger) {
    logger = createLogger();
  }
  const startTime = Date.now();
  logger.logEvent('IMAGE_DOWNLOAD_START', {
    contentUrl: contentUrl
  });

  try {
    const appId = config.botId;  // Use config for botId
    const appPassword = config.botPassword;  // Use config for botPassword
    const credentials = new MicrosoftAppCredentials(appId, appPassword);

    const token = await credentials.getToken();

    const response = await axios.get(contentUrl, {
      responseType: "arraybuffer",
      headers: { "Authorization": `Bearer ${token}` },
    });

        // Log successful download
        logger.logOperation('IMAGE_DOWNLOAD', Date.now() - startTime, true, {
          contentUrl: contentUrl,
          sizeBytes: response.data.length,
          contentType: response.headers['content-type']
        });
    return Buffer.from(response.data, "binary");
  } catch (error) {
    logger.logError(error, 'IMAGE_DOWNLOAD', {
      contentUrl: contentUrl,
      duration: Date.now() - startTime
    });
    throw error;
  }
}

module.exports = {
  analyzeImageWithGPT,
  downloadImage,
  createLogger  // Export createLogger function
};
