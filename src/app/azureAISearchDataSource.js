// Copyright (c) 2024 ZyptAI, tim.barrow@zyptai.com
// This software is proprietary to ZyptAI.
// File: /azureAISearchDataSource.js

const { OpenAIEmbeddings } = require("@microsoft/teams-ai");
const { AzureKeyCredential, SearchClient } = require("@azure/search-documents");

/**
 * A data source that searches through Azure AI search and performs hybrid search combining vector and text searches.
 */
class AzureAISearchDataSource {
  /**
   * Creates a new `AzureAISearchDataSource` instance.
   * @param {Object} options - Configuration options for Azure AI Search
   * @param {Object} logger - Logger instance for tracking operations
   */
  constructor(options, logger) {
    const startTime = Date.now();
    
    try {
      // Validate required parameters
      const requiredParams = [
        'name',
        'indexName',
        'azureAISearchApiKey',
        'azureAISearchEndpoint',
        'azureOpenAIApiKey',
        'azureOpenAIEndpoint',
        'azureOpenAIEmbeddingDeploymentName'
      ];

      const missingParams = requiredParams.filter(param => !options[param]);

      if (missingParams.length > 0) {
        throw new Error(`Missing required parameters: ${missingParams.join(', ')}`);
      }

      if (!logger) {
        throw new Error('Logger instance is required');
      }

      // Store configuration
      this.name = options.name;
      this.options = options;
      this.logger = logger;

      // Log initialization start
      this.logger.logEvent('SEARCH_DS_INIT_START', {
        datasourceName: this.name,
        indexName: options.indexName,
        endpoint: this.maskEndpoint(options.azureAISearchEndpoint)
      });

      // Initialize the search client
      this.searchClient = new SearchClient(
        options.azureAISearchEndpoint,
        options.indexName,
        new AzureKeyCredential(options.azureAISearchApiKey),
        {}
      );

      // Log successful initialization
      this.logger.logOperation('SEARCH_DS_INIT', Date.now() - startTime, true, {
        datasourceName: this.name,
        indexName: options.indexName,
        endpoint: this.maskEndpoint(options.azureAISearchEndpoint),
        deploymentName: options.azureOpenAIEmbeddingDeploymentName
      });

    } catch (error) {
      // Log initialization failure
      this.logger.logOperation('SEARCH_DS_INIT', Date.now() - startTime, false, {
        datasourceName: options?.name || 'unknown',
        error: error.message,
        missingParams: missingParams?.join(', ')
      });

      this.logger.logError(error, 'SEARCH_DS_INIT', {
        datasourceName: options?.name || 'unknown'
      });

      throw error;
    }
  }

  /**
   * Masks sensitive parts of the endpoint URL for logging
   * @param {string} endpoint - The endpoint URL to mask
   * @returns {string} - Masked endpoint URL
   * @private
   */
  maskEndpoint(endpoint) {
    try {
      const url = new URL(endpoint);
      return `${url.protocol}//${url.hostname}`;
    } catch {
      return 'invalid-endpoint';
    }
  }

/**
 * Main function to perform a hybrid search combining vector and keyword search with RAG pipeline.
 * @param {Object} context - The bot context.
 * @param {Object} memory - Memory storage for the context.
 * @param {Object} tokenizer - Tokenizer to limit token count.
 * @param {Number} maxTokens - Maximum tokens allowed for result.
 * @returns {Object} - Search result and metadata.
 */
async renderData(context, memory, tokenizer, maxTokens) {
  const startTime = Date.now();
  
  try {
      const query = memory.getValue("temp.input");
      
      // Early exit if no query
      if (!query) {
          this.logger.logOperation('RENDER_DATA', Date.now() - startTime, true, {
              status: 'no_query',
              outputLength: 0
          });
          return { output: "", length: 0, tooLong: false };
      }

      // Log start of search operation
      this.logger.logEvent('RENDER_DATA_START', {
          queryLength: query.length,
          maxTokens: maxTokens,
          timestamp: new Date().toISOString()
      });

      // Generate embedding for vector search
      const queryVector = await this.getEmbeddingVector(query);

      // Perform the hybrid search
      const searchResults = await this.performHybridSearch(query, queryVector);

      // Process and format results
      const processStartTime = Date.now();
      const results = await this.processSearchResults(searchResults, tokenizer, maxTokens);
      const processingTime = Date.now() - processStartTime;

      // Calculate metrics
      const metrics = {
          queryLength: query.length,
          resultLength: results.length,
          outputLength: results.output.length,
          processingTime: processingTime,
          totalTime: Date.now() - startTime,
          tooLong: results.tooLong,
          status: 'success',
          chunkCount: results.metadata?.chunkCount || 0,
          totalChunks: results.metadata?.totalChunks || 0
      };

      // Log successful completion
      this.logger.logOperation('RENDER_DATA', Date.now() - startTime, true, metrics);

      return results;

  } catch (error) {
      // Calculate duration even for failed operations
      const duration = Date.now() - startTime;

      // Log the error
      this.logger.logError(error, 'RENDER_DATA', {
          queryLength: memory.getValue("temp.input")?.length,
          maxTokens: maxTokens,
          duration: duration
      });

      // Log the failed operation
      this.logger.logOperation('RENDER_DATA', duration, false, {
          status: 'error',
          errorType: error.name,
          errorMessage: error.message,
          queryLength: memory.getValue("temp.input")?.length
      });

      throw error;  // Re-throw to be handled by caller
  }
}
/**
 * Performs the hybrid search using Azure Search (combining vector and keyword searches with reranking).
 * @param {String} query - The user input query.
 * @param {Array} queryVector - The embedding vector for the query.
 * @returns {Object} - Raw search results from Azure.
 */
async performHybridSearch(query, queryVector) {
  const startTime = Date.now();
  
  try {
      // Log start of search operation
      this.logger.logEvent('HYBRID_SEARCH_START', {
          queryLength: query.length,
          vectorDimensions: queryVector.length,
          timestamp: new Date().toISOString()
      });

      const selectedFields = ["description", "chunkindex", "filename", "fileUrl"];
      const searchResults = await this.searchClient.search(query, {
          searchFields: ["description", "filename"],
          select: selectedFields,
          vectorQueries: [
              {
                  kind: "vector",
                  fields: ["descriptionVector"],
                  kNearestNeighborsCount: 48,
                  vector: queryVector
              }
          ],
          vectorFilterMode: "hybridRerank",
          top: 48
      });

      // Collect all results from the async iterator
      const results = [];
      for await (const result of searchResults.results) {
          results.push(result);
      }

      // Calculate metrics
      const metrics = {
          queryLength: query.length,
          resultCount: results.length,
          vectorDimensions: queryVector.length,
          kNN: 48,
          duration: Date.now() - startTime,
          status: 'success'
      };

      // Log successful operation
      this.logger.logOperation('HYBRID_SEARCH', Date.now() - startTime, true, metrics);

      return { results };

  } catch (error) {
      // Calculate duration even for failed operations
      const duration = Date.now() - startTime;

      // Log the error
      this.logger.logError(error, 'HYBRID_SEARCH', {
          queryLength: query?.length,
          vectorDimensions: queryVector?.length,
          duration: duration
      });

      // Log the failed operation
      this.logger.logOperation('HYBRID_SEARCH', duration, false, {
          status: 'error',
          errorType: error.name,
          errorMessage: error.message,
          queryLength: query?.length
      });

      throw error;
  }
}

/**
 * Processes and formats the search results, ensuring they stay within token limits and handles chunking.
 * @param {Object} searchResults - Raw results from the Azure Search API.
 * @param {Object} tokenizer - Tokenizer to handle token length.
 * @param {Number} maxTokens - Maximum allowed tokens for the result.
 * @returns {Object} - Formatted search results and metadata.
 */
async processSearchResults(searchResults, tokenizer, maxTokens) {
  const startTime = Date.now();
  
  try {
      // Log start of processing
      this.logger.logEvent('PROCESS_RESULTS_START', {
          resultCount: searchResults?.results?.length || 0,
          maxTokens: maxTokens,
          timestamp: new Date().toISOString()
      });

      // Early exit if no results
      if (!searchResults?.results?.length) {
          const metrics = {
              status: 'no_results',
              duration: Date.now() - startTime,
              processedCount: 0,
              outputTokens: 0
          };

          this.logger.logOperation('PROCESS_RESULTS', Date.now() - startTime, true, metrics);
          return { output: "", length: 0, tooLong: false };
      }

      let usedTokens = 0;
      let allContent = "";
      let filename = "";
      let fileUrl = "";
      let chunkCount = 0;
      let totalChunks = 0;
      let processedCount = 0;
      let truncated = false;

      // Process each result
      for (const result of searchResults.results) {
          processedCount++;
          
          const formattedResult = this.formatDocument(result.document.description);
          const tokens = tokenizer.encode(formattedResult).length;

          if (usedTokens + tokens > maxTokens) {
              truncated = true;
              break;
          }

          allContent += formattedResult + " ";
          usedTokens += tokens;

          chunkCount++;
          totalChunks = Math.max(totalChunks, result.document.totalChunks || 0);

          // Capture first valid filename and fileUrl
          if (!filename && result.document.filename) {
              filename = result.document.filename;
          }
          if (!fileUrl && result.document.fileUrl) {
              fileUrl = result.document.fileUrl;
          }
      }

      // Create output string
      const outputString = `Processed ${chunkCount} out of ${totalChunks} total chunks.\nSummary: ${allContent.slice(0, maxTokens)}\nFilename: ${filename}\nFile URL: ${fileUrl}`;
      const outputTokens = tokenizer.encode(outputString).length;

      // Calculate final metrics
      const metrics = {
          duration: Date.now() - startTime,
          processedCount: processedCount,
          totalResults: searchResults.results.length,
          outputTokens: outputTokens,
          usedTokens: usedTokens,
          truncated: truncated,
          chunkCount: chunkCount,
          totalChunks: totalChunks,
          hasFilename: !!filename,
          hasFileUrl: !!fileUrl,
          status: 'success'
      };

      // Log successful operation
      this.logger.logOperation('PROCESS_RESULTS', Date.now() - startTime, true, metrics);

      return {
          output: outputString,
          length: outputTokens,
          tooLong: outputTokens > maxTokens,
          metadata: {
              filename,
              fileUrl,
              chunkCount,
              totalChunks,
              truncated
          }
      };

  } catch (error) {
      // Calculate duration for failed operations
      const duration = Date.now() - startTime;

      // Log the error
      this.logger.logError(error, 'PROCESS_RESULTS', {
          resultCount: searchResults?.results?.length || 0,
          maxTokens: maxTokens,
          duration: duration
      });

      // Log the failed operation
      this.logger.logOperation('PROCESS_RESULTS', duration, false, {
          status: 'error',
          errorType: error.name,
          errorMessage: error.message,
          resultCount: searchResults?.results?.length || 0
      });

      throw error;
  }
}

  /**
     * Formats a search result document.
     * @param {String} result - The raw document description.
     * @returns {String} - The formatted result string.
     */
  formatDocument(result) {
    return `<context>${result}</context>`;
  }

/**
 * Generates an embedding vector for the given text input.
 * @param {String} text - The text input for which to generate an embedding.
 * @returns {Array} - Embedding vector for the text.
 */
async getEmbeddingVector(text) {
  const startTime = Date.now();
  
  // Start event
  this.logger.logEvent('EMBEDDING_START', {
      textLength: text.length,
      timestamp: new Date().toISOString()
  });
  
  try {
      const embeddings = new OpenAIEmbeddings({
          azureApiKey: this.options.azureOpenAIApiKey,
          azureEndpoint: this.options.azureOpenAIEndpoint,
          azureDeployment: this.options.azureOpenAIEmbeddingDeploymentName,
      });

      const result = await embeddings.createEmbeddings(this.options.azureOpenAIEmbeddingDeploymentName, text);
      
      // Debug log to see the full structure of the result
      //console.log('Embedding result structure:', JSON.stringify(result, null, 2));

      if (result.status !== "success" || !result.output) {
          throw new Error(`Failed to generate embeddings for description: ${text}`);    
      }

      // Create metrics object with guaranteed fields
      const metrics = {
          textLength: text.length,
          vectorDimensions: result.output[0].length,
          modelName: this.options.azureOpenAIEmbeddingDeploymentName
      };

      // Only add token metrics if they exist
      if (result.usage && typeof result.usage === 'object') {
          if (result.usage.prompt_tokens) {
              metrics.inputTokens = result.usage.prompt_tokens;
          }
          if (result.usage.total_tokens) {
              metrics.totalTokens = result.usage.total_tokens;
          }
      }

      // Log successful operation with available metrics
      this.logger.logOperation('EMBEDDING', Date.now() - startTime, true, metrics);

      return result.output[0];
  } catch (error) {
      // Log failed operation
      this.logger.logOperation('EMBEDDING', Date.now() - startTime, false, {
          textLength: text.length,
          error: error.message
      });
      
      // Log error details
      this.logger.logError(error, 'EMBEDDING', {
          textLength: text.length
      });
      
      throw error;
  }
}
}

module.exports = {
  AzureAISearchDataSource,
};
