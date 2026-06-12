import { axios } from "@pipedream/platform"
import microsoft_onedrive from "@pipedream/microsoft_onedrive"

export default defineComponent({
  name: "Comprehensive OneDrive Knowledge Scanner",
  description: "Scan OneDrive folders for IT knowledge documents, extract and analyze content with AI, clean data, deduplicate records, and normalize output in one comprehensive step",
  type: "action",
  props: {
    microsoft_onedrive,
    folderId: {
      propDefinition: [
        microsoft_onedrive,
        "folder",
      ],
      description: "Select the folder to scan for IT knowledge documents",
    },
    includeFileTypes: {
      type: "string[]",
      label: "Include File Types",
      description: "Select the types of files to scan for IT knowledge documents",
      options: [
        { label: "Word Documents (.docx)", value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
        { label: "Word Documents (.doc)", value: "application/msword" },
        { label: "PDF Documents", value: "application/pdf" },
        { label: "Text Files (.txt)", value: "text/plain" },
        { label: "Markdown Files (.md)", value: "text/markdown" },
        { label: "OneNote Files (.one)", value: "application/onenote" },
      ],
      default: [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword", 
        "application/pdf",
        "text/plain",
        "text/markdown",
        "application/onenote"
      ],
    },
    excludeFolders: {
      type: "string[]",
      label: "Exclude Folders",
      description: "List of folder names to exclude from scanning (case-insensitive)",
      optional: true,
      default: ["temp", "cache", "backup", "archive", "recycle bin", "trash"],
    },
    maxFiles: {
      type: "integer",
      label: "Maximum Files",
      description: "Maximum number of files to process",
      default: 5,
      min: 1,
      max: 20,
    },
    scanSubfolders: {
      type: "boolean",
      label: "Scan Subfolders",
      description: "Whether to recursively scan subfolders",
      default: true,
    },
    enableDeduplication: {
      type: "boolean",
      label: "Enable Deduplication",
      description: "Remove duplicate documents based on content similarity",
      default: true,
    },
    similarityThreshold: {
      type: "string",
      label: "Similarity Threshold",
      description: "Threshold for considering documents as duplicates (0.1 = very different, 0.9 = very similar)",
      default: "0.8",
      optional: true,
    },
    enableContentCleaning: {
      type: "boolean",
      label: "Enable Content Cleaning",
      description: "Clean and normalize extracted text content",
      default: true,
    },
    outputFormat: {
      type: "string",
      label: "Output Format",
      description: "Format for the final output",
      options: [
        { label: "Structured JSON", value: "json" },
        { label: "Summary Report", value: "summary" },
        { label: "Knowledge Base Format", value: "knowledge_base" }
      ],
      default: "json",
    },
  },
  methods: {
    generateContentHash(content) {
      // Simple hash function for content comparison
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return hash.toString();
    },

    cleanTextContent(text) {
      if (!this.enableContentCleaning || !text) return text;
      
      return text
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        // Remove special characters that might interfere with analysis
        .replace(/[^\w\s.,;:!?()-]/g, ' ')
        // Remove multiple periods/dots
        .replace(/\.{2,}/g, '.')
        // Trim and ensure proper spacing
        .trim()
        // Limit length for processing efficiency
        .slice(0, 5000);
    },

    calculateContentSimilarity(content1, content2) {
      if (!content1 || !content2) return 0;
      
      const words1 = new Set(content1.toLowerCase().split(/\s+/));
      const words2 = new Set(content2.toLowerCase().split(/\s+/));
      
      const intersection = new Set([...words1].filter(x => words2.has(x)));
      const union = new Set([...words1, ...words2]);
      
      return intersection.size / union.size;
    },

    async extractTextFromFile(file, $) {
      try {
        const downloadUrl = file["@microsoft.graph.downloadUrl"];
        if (!downloadUrl) {
          return {
            success: false,
            content: "Content extraction not available - no download URL",
            method: "error"
          };
        }

        const mimeType = file.file?.mimeType || "";
        let extractedText = "";
        let extractionMethod = "unknown";

        // Download file content for text files
        if (mimeType.includes("text/plain") || mimeType.includes("text/markdown")) {
          try {
            const response = await axios($, {
              url: downloadUrl,
              responseType: "text",
            });
            extractedText = response;
            extractionMethod = "direct_text";
          } catch (error) {
            extractedText = `Text file: ${file.name}. Direct extraction failed: ${error.message}`;
            extractionMethod = "metadata_fallback";
          }
        } else if (mimeType.includes("application/pdf")) {
          extractedText = `PDF Document: ${file.name}. Size: ${file.size} bytes. Requires specialized PDF parsing for full content extraction.`;
          extractionMethod = "metadata_description";
        } else if (mimeType.includes("application/msword") || mimeType.includes("wordprocessingml")) {
          extractedText = `Word Document: ${file.name}. Size: ${file.size} bytes. Contains structured document content.`;
          extractionMethod = "metadata_description";
        } else if (mimeType.includes("onenote")) {
          extractedText = `OneNote File: ${file.name}. Size: ${file.size} bytes. Contains notes and structured content.`;
          extractionMethod = "metadata_description";
        } else {
          extractedText = `File: ${file.name}. Type: ${mimeType}. Size: ${file.size} bytes.`;
          extractionMethod = "basic_metadata";
        }

        const cleanedContent = this.cleanTextContent(extractedText);

        return {
          success: true,
          content: cleanedContent,
          method: extractionMethod,
          originalLength: extractedText.length,
          cleanedLength: cleanedContent.length
        };
      } catch (error) {
        console.error(`Error extracting text from ${file.name}:`, error);
        return {
          success: false,
          content: `Error extracting content: ${error.message}`,
          method: "error"
        };
      }
    },

    async enhanceWithAI(extractedText, fileName, metadata, $) {
      try {
        const prompt = `As an IT knowledge management expert, analyze this document and provide a comprehensive structured summary:

Document: ${fileName}
Content: ${extractedText.slice(0, 2000)}
Metadata: ${JSON.stringify(metadata)}

Provide analysis in this exact JSON format:
{
  "documentType": "specific type (e.g., 'Technical Guide', 'Policy Document', 'Troubleshooting Manual')",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "technicalRelevance": "High|Medium|Low",
  "importantInfo": "key information extracted from content",
  "useCases": ["use case 1", "use case 2"],
  "knowledgeCategory": "category (e.g., 'Infrastructure', 'Security', 'Development')",
  "confidenceScore": 0.85,
  "extractionNotes": "notes about content quality and extraction method"
}`;

        const response = await $.services.openai.completions.create({
          model: "gpt-4o",
          messages: [
            { 
              role: "system", 
              content: "You are an expert AI assistant specialized in analyzing IT knowledge documents. Always return valid JSON in the exact format requested. Be precise and analytical." 
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.2,
          max_tokens: 1000,
        });

        const aiAnalysis = response.choices[0].message.content;
        
        try {
          const parsedAnalysis = JSON.parse(aiAnalysis);
          return {
            success: true,
            analysis: parsedAnalysis
          };
        } catch (parseError) {
          return {
            success: false,
            analysis: {
              documentType: "IT Knowledge Document",
              keyTopics: ["Analysis parsing error"],
              technicalRelevance: "Unknown",
              importantInfo: aiAnalysis.slice(0, 500),
              useCases: ["Manual review required"],
              knowledgeCategory: "Uncategorized",
              confidenceScore: 0.1,
              extractionNotes: "AI response parsing failed"
            }
          };
        }
      } catch (error) {
        console.error("AI enhancement error:", error);
        return {
          success: false,
          analysis: {
            documentType: "IT Knowledge Document",
            keyTopics: ["AI analysis failed"],
            technicalRelevance: "Unknown",
            importantInfo: `AI analysis failed: ${error.message}`,
            useCases: ["Manual review required"],
            knowledgeCategory: "Uncategorized",
            confidenceScore: 0.0,
            extractionNotes: `AI service error: ${error.message}`
          }
        };
      }
    },

    async scanFolder(folderId, processedFiles, excludeFolderNames, includeTypes, maxFiles) {
      if (processedFiles.length >= maxFiles) {
        return processedFiles;
      }

      try {
        const response = await this.microsoft_onedrive.httpRequest({
          url: `/items/${folderId}/children?$expand=thumbnails&$select=id,name,file,folder,size,createdDateTime,lastModifiedDateTime,parentReference,@microsoft.graph.downloadUrl`,
        });

        for (const item of response.value) {
          if (processedFiles.length >= maxFiles) {
            break;
          }

          if (item.folder && this.scanSubfolders) {
            const folderNameLower = item.name.toLowerCase();
            const shouldExclude = excludeFolderNames.some(excludeName => 
              folderNameLower.includes(excludeName.toLowerCase())
            );

            if (!shouldExclude) {
              await this.scanFolder(item.id, processedFiles, excludeFolderNames, includeTypes, maxFiles);
            }
          }

          if (item.file && item.file.mimeType) {
            const shouldInclude = includeTypes.some(type => 
              item.file.mimeType.includes(type) || 
              type.includes(item.file.mimeType)
            );

            if (shouldInclude) {
              processedFiles.push(item);
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning folder ${folderId}:`, error);
      }

      return processedFiles;
    },

    deduplicateDocuments(documents) {
      if (!this.enableDeduplication) return documents;

      const threshold = parseFloat(this.similarityThreshold || 0.8);
      const uniqueDocuments = [];
      const duplicateGroups = [];

      for (const doc of documents) {
        let isDuplicate = false;
        
        for (const unique of uniqueDocuments) {
          const similarity = this.calculateContentSimilarity(
            doc.extractedContent?.content || "",
            unique.extractedContent?.content || ""
          );
          
          if (similarity >= threshold) {
            isDuplicate = true;
            // Keep the document with better extraction success or larger content
            if (doc.extractedContent?.success && doc.extractedContent?.content?.length > unique.extractedContent?.content?.length) {
              const index = uniqueDocuments.indexOf(unique);
              duplicateGroups.push({
                kept: doc.metadata.name,
                removed: unique.metadata.name,
                similarity: similarity
              });
              uniqueDocuments[index] = doc;
            } else {
              duplicateGroups.push({
                kept: unique.metadata.name,
                removed: doc.metadata.name,
                similarity: similarity
              });
            }
            break;
          }
        }
        
        if (!isDuplicate) {
          uniqueDocuments.push(doc);
        }
      }

      return {
        documents: uniqueDocuments,
        duplicateGroups,
        originalCount: documents.length,
        uniqueCount: uniqueDocuments.length
      };
    },

    normalizeOutput(documents, deduplicationResult, outputFormat) {
      const processingSummary = {
        totalFilesScanned: documents.length,
        successfulExtractions: documents.filter(d => d.extractedContent?.success).length,
        aiAnalysisSuccess: documents.filter(d => d.aiAnalysis?.success).length,
        deduplicationEnabled: this.enableDeduplication,
        duplicatesRemoved: deduplicationResult.duplicateGroups?.length || 0,
        finalDocumentCount: deduplicationResult.documents?.length || documents.length
      };

      const normalizedDocuments = (deduplicationResult.documents || documents).map(doc => ({
        id: doc.metadata.id,
        name: doc.metadata.name,
        path: doc.metadata.parentPath,
        size: doc.metadata.size,
        type: doc.metadata.mimeType,
        created: doc.metadata.createdDateTime,
        modified: doc.metadata.lastModifiedDateTime,
        contentHash: this.generateContentHash(doc.extractedContent?.content || ""),
        extractionMethod: doc.extractedContent?.method,
        extractionSuccess: doc.extractedContent?.success,
        contentPreview: doc.extractedContent?.content?.slice(0, 200) + "...",
        aiAnalysis: doc.aiAnalysis?.analysis || {},
        aiAnalysisSuccess: doc.aiAnalysis?.success,
        processedAt: new Date().toISOString()
      }));

      switch (outputFormat) {
        case "summary":
          return {
            summary: processingSummary,
            keyInsights: {
              documentTypes: [...new Set(normalizedDocuments.map(d => d.aiAnalysis.documentType).filter(Boolean))],
              knowledgeCategories: [...new Set(normalizedDocuments.map(d => d.aiAnalysis.knowledgeCategory).filter(Boolean))],
              highRelevanceDocuments: normalizedDocuments.filter(d => d.aiAnalysis.technicalRelevance === "High"),
              extractionIssues: normalizedDocuments.filter(d => !d.extractionSuccess)
            },
            duplicateGroups: deduplicationResult.duplicateGroups || []
          };
          
        case "knowledge_base":
          return {
            knowledgeBase: normalizedDocuments.map(doc => ({
              title: doc.name,
              category: doc.aiAnalysis.knowledgeCategory || "Uncategorized",
              topics: doc.aiAnalysis.keyTopics || [],
              content: doc.contentPreview,
              relevance: doc.aiAnalysis.technicalRelevance,
              useCases: doc.aiAnalysis.useCases || [],
              metadata: {
                source: "OneDrive",
                extracted: doc.processedAt,
                confidence: doc.aiAnalysis.confidenceScore || 0
              }
            })),
            processingStats: processingSummary
          };
          
        default: // json
          return {
            processingSummary,
            documents: normalizedDocuments,
            deduplication: {
              enabled: this.enableDeduplication,
              duplicateGroups: deduplicationResult.duplicateGroups || [],
              statistics: {
                originalCount: deduplicationResult.originalCount || documents.length,
                finalCount: deduplicationResult.uniqueCount || documents.length,
                duplicatesRemoved: deduplicationResult.duplicateGroups?.length || 0
              }
            }
          };
      }
    }
  },
  async run({ $ }) {
    const startTime = Date.now();
    const results = [];
    let scannedFiles = [];

    // Step 1: Scan OneDrive folders
    $.export("$summary", "Starting comprehensive OneDrive knowledge document scan...");
    
    scannedFiles = await this.scanFolder(
      this.folderId,
      scannedFiles,
      this.excludeFolders || [],
      this.includeFileTypes,
      this.maxFiles
    );

    if (scannedFiles.length === 0) {
      return {
        message: "No files found matching the criteria",
        scanSettings: {
          folderId: this.folderId,
          includeFileTypes: this.includeFileTypes,
          maxFiles: this.maxFiles
        }
      };
    }

    $.export("$summary", `Found ${scannedFiles.length} files. Processing content extraction and AI analysis...`);

    // Step 2: Process each file with extraction, AI analysis, and error handling
    for (const file of scannedFiles.slice(0, this.maxFiles)) {
      try {
        // Extract metadata
        const metadata = {
          id: file.id,
          name: file.name,
          size: file.size,
          mimeType: file.file?.mimeType,
          createdDateTime: file.createdDateTime,
          lastModifiedDateTime: file.lastModifiedDateTime,
          parentPath: file.parentReference?.path,
          webUrl: file.webUrl,
        };

        // Extract content
        const extractedContent = await this.extractTextFromFile(file, $);

        // AI analysis
        const aiAnalysis = await this.enhanceWithAI(
          extractedContent.content, 
          file.name, 
          metadata, 
          $
        );

        results.push({
          metadata,
          extractedContent,
          aiAnalysis,
          processedAt: new Date().toISOString()
        });

      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        results.push({
          metadata: {
            id: file.id,
            name: file.name,
            error: error.message,
          },
          extractedContent: {
            success: false,
            content: "Processing error",
            method: "error"
          },
          aiAnalysis: {
            success: false,
            analysis: {
              documentType: "Processing Error",
              error: error.message,
            }
          },
          processedAt: new Date().toISOString(),
        });
      }
    }

    // Step 3: Deduplication
    const deduplicationResult = this.deduplicateDocuments(results);
    
    // Step 4: Normalize and format output
    const finalOutput = this.normalizeOutput(results, deduplicationResult, this.outputFormat);

    const processingTime = Date.now() - startTime;
    
    $.export("$summary", `Completed processing ${results.length} documents in ${processingTime}ms. ${deduplicationResult.duplicateGroups?.length || 0} duplicates removed.`);

    return {
      ...finalOutput,
      scanConfiguration: {
        folderId: this.folderId,
        includeFileTypes: this.includeFileTypes,
        excludeFolders: this.excludeFolders,
        maxFiles: this.maxFiles,
        scanSubfolders: this.scanSubfolders,
        enableDeduplication: this.enableDeduplication,
        similarityThreshold: this.similarityThreshold,
        enableContentCleaning: this.enableContentCleaning,
        outputFormat: this.outputFormat
      },
      performanceMetrics: {
        totalProcessingTimeMs: processingTime,
        averageProcessingTimePerFile: processingTime / results.length,
        scanTimestamp: new Date().toISOString()
      }
    };
  }
})