/* eslint-disable no-console */
// Copyright (c) 2024 ZyptAI, tim.barrow@zyptai.com
// This software is proprietary to ZyptAI.
// File: /app.js


// Initialize Application Insights first
const { initializeAppInsights } = require('./utils/appInsightsConfig');
const config = require("../config");
const { appInsights, client: appInsightsClient } = initializeAppInsights(config.appInsightsConnectionString);

// Now import other dependencies
const { MemoryStorage, ActivityTypes } = require("botbuilder");
const path = require("path");
const { Application, ActionPlanner, OpenAIModel, PromptManager } = require("@microsoft/teams-ai");
const { AzureAISearchDataSource } = require("./azureAISearchDataSource");
const { analyzeImageWithGPT, downloadImage } = require("./imageAnalysis");
const fileType = require("file-type");  
const { handleApiQuery } = require("./apiHandler");
const LoggingUtil = require("./loggingUtil");

// Initialize logger after we have the client
const logger = new LoggingUtil(appInsightsClient);

// Initialize AI components
const model = new OpenAIModel({
  azureApiKey: config.azureOpenAIKey,
  azureDefaultDeployment: config.azureOpenAIDeploymentName,
  azureEndpoint: config.azureOpenAIEndpoint,
  useSystemMessages: true,
  logRequests: true,
});

const prompts = new PromptManager({
  promptsFolder: path.join(__dirname, "../prompts"),
});
const planner = new ActionPlanner({
  model,
  prompts,
  defaultPrompt: "chat",
  returnFullResponse: true
});

console.log('Logger available before creating AzureAISearchDataSource:', !!logger);
planner.prompts.addDataSource(
  new AzureAISearchDataSource({
    name: "azure-ai-search",
    indexName: "sharepointblobindx",
    azureAISearchApiKey: config.azureSearchKey,
    azureAISearchEndpoint: config.azureSearchEndpoint,
    azureOpenAIApiKey: config.azureOpenAIKey,
    azureOpenAIEndpoint: config.azureOpenAIEndpoint,
    azureOpenAIEmbeddingDeploymentName: config.azureOpenAIEmbeddingDeploymentName,
  }, logger)
);

const storage = new MemoryStorage();
const app = new Application({
  storage,
  ai: {
    planner,
  },
});

// Handle image analysis process
async function handleImageAnalysis(context) {
  const startTime = Date.now();
  const attachment = context.activity.attachments[0];

  // Log the start of image analysis
  logger.logEvent('IMAGE_START', {
    contentType: attachment.contentType,
    contentUrl: attachment.contentUrl
  });

  try {
    const imageBuffer = await downloadImage(attachment.contentUrl, logger);
    
    // Log successful download
    logger.logOperation('IMAGE_DOWNLOAD', Date.now() - startTime, true, {
      contentType: attachment.contentType,
      sizeBytes: imageBuffer.length
    });

    const userPrompt = context.activity.text || "Please analyze the image.";
    const analysisResult = await analyzeImageWithGPT(imageBuffer, userPrompt, logger);

    // Calculate total duration
    const duration = Date.now() - startTime;

    // Log successful analysis
    logger.logOperation('IMAGE_ANALYSIS', duration, true, {
      contentType: attachment.contentType,
      promptLength: userPrompt.length,
      resultLength: analysisResult.length
    });

    await context.sendActivity(`Image analysis result: ${analysisResult}`);
  } catch (error) {
    // Log the error
    logger.logError(error, 'IMAGE_ANALYSIS', {
      contentType: attachment.contentType,
      contentUrl: attachment.contentUrl
    });

    // Log failed operation
    logger.logOperation('IMAGE_ANALYSIS', Date.now() - startTime, false, {
      contentType: attachment.contentType,
      errorType: error.name,
      errorMessage: error.message
    });

    await context.sendActivity("I'm sorry, I encountered an error while processing your image.");
  }
}
async function handleRagAndLlm(context, state) {
  const startTime = Date.now();
  
  try {
      // Log the start of message processing
      logger.logEvent('MESSAGE_START', {
          messageType: context.activity.type,
          locale: context.activity.locale || 'unknown'
      });

      // Get the response from the planner
      const response = await app.ai.planner.completePrompt(context, state, "chat");

      // Calculate operation duration
      const duration = Date.now() - startTime;

      // Log the complete operation
      logger.logOperation('MESSAGE', duration, true, {
          messageType: context.activity.type,
          responseLength: response.message?.content?.length || 0
      });

      await context.sendActivity(response.message.content);
  } catch (error) {
      // Calculate duration even for failed operations
      const duration = Date.now() - startTime;

      // Log the error
      logger.logError(error, 'MESSAGE', {
          duration,
          messageType: context.activity.type,
          locale: context.activity.locale || 'unknown'
      });

      // Log the failed operation
      logger.logOperation('MESSAGE', duration, false, {
          errorType: error.name,
          errorMessage: error.message
      });

      await context.sendActivity("I'm sorry, I couldn't process your message at this time.");
  }
}

// Handle file attachments for downloadable files
async function handleFileDownloadInfoAttachment(attachment, context, state) {
  console.log("Processing file download info attachment.");

  try {
    const fileInfo = attachment.content;  // Contains file metadata
    const fileUrl = fileInfo.downloadUrl;  // URL to download the file
    const fileName = fileInfo.uniqueId;  // The file's unique ID

    console.log(`File name: ${fileName}`);
    console.log(`File URL: ${fileUrl}`);

    // Download the file using the bot's credentials - pass logger to downloadImage
    const fileBuffer = await downloadImage(fileUrl, logger);

    // Determine the file type
    const type = await fileType.fromBuffer(fileBuffer);

    if (type && type.mime.startsWith("image/")) {
      console.log("Downloaded file is an image.");

      // Store the image buffer for further processing
      state.temp.imageBuffer = fileBuffer;
      console.log("Image buffer stored in memory.");

      // User prompt or instruction to analyze the image
      const userPrompt = context.activity.text || "Please analyze the image.";
      console.log("User prompt:", userPrompt);

      // Analyze the image using GPT - pass logger
      const analysisResult = await analyzeImageWithGPT(fileBuffer, userPrompt, logger);

      await context.sendActivity(`Image analysis result: ${analysisResult}`);
    } else {
      console.log("Downloaded file is not an image.");
      await context.sendActivity("The file you uploaded is not an image. Please upload an image file.");
    }
  } catch (error) {
    console.error("Error processing file download info attachment:", error);
    await context.sendActivity("I'm sorry, I couldn't process the file you uploaded.");
  }
}

// Modify the handleMessage function
async function handleMessage(context, state) {
  // Declare startTime at the beginning of the function
  const startTime = Date.now();

  try {
        // Set user context at the start of each interaction
        logger.setUserContext(
          context.activity.from.id,
          {
            name: context.activity.from.name,
            channelId: context.activity.channelId,
            conversationId: context.activity.conversation.id
          }
        );

        // Log the received message type and basic info
        logger.logEvent('MESSAGE_RECEIVED', {
            messageType: context.activity.type,
            hasAttachments: !!context.activity.attachments?.length,
            textLength: context.activity.text?.length || 0,
            channelId: context.activity.channelId,
            locale: context.activity.locale || 'unknown'
        });
    // Handle Jira query
    if (context.activity.text && context.activity.text.toLowerCase().includes("jira")) {
      await handleApiQuery(context, state, "JIRA", logger);  // Pass the logger instance
    } 
    // Handle attachments (including image or file upload)
    else if (context.activity.attachments && context.activity.attachments.length > 0) {
      const attachment = context.activity.attachments[0];
      logger.logEvent('ATTACHMENT_RECEIVED', {
        contentType: attachment.contentType,
        hasContent: !!attachment.content,
        hasContentUrl: !!attachment.contentUrl
    });

      // Case 1: Direct image (pasted image)
      if (attachment.contentType.startsWith("image/")) {
        await handleImageAnalysis(context);
      } 
      // Case 2: File upload (application/vnd.microsoft.teams.file.download.info)
      else if (attachment.contentType === "application/vnd.microsoft.teams.file.download.info") {
        console.log("Handling file upload attachment.");
        await handleFileDownloadInfoAttachment(attachment, context, state);
      } 
      // Other attachment types
      else {
        await handleRagAndLlm(context, state);
      }
          // Calculate total duration and log successful operation
    const duration = Date.now() - startTime;
    logger.logOperation(' ', duration, true, {
        messageType: context.activity.type,
        hasAttachments: !!context.activity.attachments?.length,
        processingPath: context.activity.attachments ? 
            (context.activity.attachments[0].contentType.startsWith("image/") ? 'image' : 
             context.activity.attachments[0].contentType === "application/vnd.microsoft.teams.file.download.info" ? 'file' : 'rag') :
            (context.activity.text?.toLowerCase().includes("jira") ? 'jira' : 'rag')
    });
    } 
    // Default to handle RAG/LLM processing or other message types
    else {
      await handleRagAndLlm(context, state);
    }
  } catch (error) {
    console.error("Error processing message", { error });
    await context.sendActivity("I'm sorry, I encountered an error while processing your request.");
  }
}


// Set up the bot to handle messages
app.activity(ActivityTypes.Message, async (context, state) => {
  await handleMessage(context, state);
});

module.exports = app;
