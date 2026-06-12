import { axios } from "@pipedream/platform"
import notion from "@pipedream/notion"

export default defineComponent({
  name: "Update Notion Pages with Enhanced Content",
  description: "Update existing Notion pages with enhanced content from AI processing, handling proper parent-child relationships and content management options",
  type: "action",
  props: {
    notion,
    enhancedRecords: {
      type: "string[]",
      label: "Enhanced Records",
      description: "Enhanced records from previous AI processing step. Each record should be a JSON string containing the enhanced content data.",
    },
    createdPages: {
      type: "string[]", 
      label: "Created Pages",
      description: "Created pages from database population step. Each item should be a JSON string containing page information including page IDs.",
      optional: true,
    },
    parentPageId: {
      propDefinition: [
        notion,
        "pageId",
      ],
      label: "Parent Page ID",
      description: "Set the parent page ID to avoid archived ancestor issues. All updated pages will be moved under this parent.",
      optional: true,
    },
    replaceContent: {
      type: "boolean",
      label: "Replace Existing Content",
      description: "If true, completely replace existing page content. If false, append to existing content.",
      default: false,
      optional: true,
    },
    archiveExisting: {
      type: "boolean",
      label: "Archive Existing Pages",
      description: "If true, archive pages that don't have corresponding enhanced records.",
      default: false,
      optional: true,
    },
    knowledgeBaseTitle: {
      type: "string",
      label: "Knowledge Base Title",
      description: "Title for the knowledge base or section being updated.",
      optional: true,
    },
    updateTitles: {
      type: "boolean", 
      label: "Update Page Titles",
      description: "If true, update page titles with enhanced titles from the records.",
      default: true,
      optional: true,
    },
    addSummaries: {
      type: "boolean",
      label: "Add Summaries",
      description: "If true, add summary sections to pages from enhanced content.",
      default: true,
      optional: true,
    },
  },
  methods: {
    async parseRecordData(recordString) {
      try {
        return JSON.parse(recordString);
      } catch (error) {
        throw new Error(`Failed to parse record data: ${error.message}`);
      }
    },
    
    async buildPageProperties(enhancedData, existingPage) {
      const properties = {};
      
      // Update title if requested and available
      if (this.updateTitles && enhancedData.title) {
        const titleProperty = Object.keys(existingPage.properties).find(
          key => existingPage.properties[key].type === "title"
        );
        
        if (titleProperty) {
          properties[titleProperty] = {
            title: [
              {
                type: "text",
                text: {
                  content: enhancedData.title,
                },
              },
            ],
          };
        }
      }
      
      // Add other enhanced properties if available
      if (enhancedData.summary && this.addSummaries) {
        properties["Summary"] = {
          rich_text: [
            {
              type: "text",
              text: {
                content: enhancedData.summary,
              },
            },
          ],
        };
      }
      
      if (enhancedData.tags) {
        properties["Tags"] = {
          multi_select: enhancedData.tags.map(tag => ({
            name: tag,
          })),
        };
      }
      
      return properties;
    },
    
    async buildPageBlocks(enhancedData) {
      const blocks = [];
      
      // Add summary block if available
      if (enhancedData.summary && this.addSummaries) {
        blocks.push({
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: "Summary",
                },
                annotations: {
                  bold: true,
                },
              },
            ],
          },
        });
        
        blocks.push({
          object: "block",
          type: "paragraph", 
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: enhancedData.summary,
                },
              },
            ],
          },
        });
      }
      
      // Add enhanced content if available
      if (enhancedData.content) {
        blocks.push({
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: "Enhanced Content",
                },
                annotations: {
                  bold: true,
                },
              },
            ],
          },
        });
        
        // Split content into paragraphs
        const paragraphs = enhancedData.content.split('\n\n').filter(p => p.trim());
        
        for (const paragraph of paragraphs) {
          blocks.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: paragraph.trim(),
                  },
                },
              ],
            },
          });
        }
      }
      
      return blocks;
    },
    
    async clearPageContent(pageId) {
      // Get existing blocks
      const { results: blocks } = await this.notion.listBlockChildren(pageId, {});
      
      // Delete existing blocks
      for (const block of blocks) {
        await this.notion.deleteBlock(block.id);
      }
    },
  },
  async run({ $ }) {
    const results = {
      updatedPages: [],
      errors: [],
      summary: {},
    };
    
    try {
      // Parse enhanced records
      const enhancedData = await Promise.all(
        this.enhancedRecords.map(record => this.parseRecordData(record))
      );
      
      // Parse created pages if provided
      let createdPagesData = [];
      if (this.createdPages && this.createdPages.length > 0) {
        createdPagesData = await Promise.all(
          this.createdPages.map(page => this.parseRecordData(page))
        );
      }
      
      // Create a mapping of page identifiers to enhanced data
      const enhancedMap = new Map();
      enhancedData.forEach(data => {
        // Use multiple identifiers to match pages
        if (data.pageId) enhancedMap.set(data.pageId, data);
        if (data.title) enhancedMap.set(data.title, data);
        if (data.originalId) enhancedMap.set(data.originalId, data);
      });
      
      // Process created pages if available
      if (createdPagesData.length > 0) {
        for (const pageData of createdPagesData) {
          try {
            const pageId = pageData.id || pageData.pageId;
            if (!pageId) {
              results.errors.push({
                error: "Missing page ID in created pages data",
                data: pageData,
              });
              continue;
            }
            
            // Find corresponding enhanced data
            let enhanced = enhancedMap.get(pageId) || 
                          enhancedMap.get(pageData.title) ||
                          enhancedMap.get(pageData.originalId);
            
            if (!enhanced) {
              // If archiving is enabled, archive this page
              if (this.archiveExisting) {
                await this.notion.updatePage(pageId, {
                  archived: true,
                });
                results.updatedPages.push({
                  id: pageId,
                  action: "archived",
                  reason: "No enhanced data found",
                });
              }
              continue;
            }
            
            // Retrieve existing page
            const existingPage = await this.notion.retrievePage(pageId);
            
            // Build update payload
            const updatePayload = {
              properties: await this.buildPageProperties(enhanced, existingPage),
            };
            
            // Set parent if specified
            if (this.parentPageId) {
              updatePayload.parent = {
                type: "page_id",
                page_id: this.parentPageId,
              };
            }
            
            // Update page properties
            const updatedPage = await this.notion.updatePage(pageId, updatePayload);
            
            // Handle content updates
            if (enhanced.content || enhanced.summary) {
              const blocks = await this.buildPageBlocks(enhanced);
              
              if (blocks.length > 0) {
                // Clear existing content if replacing
                if (this.replaceContent) {
                  await this.clearPageContent(pageId);
                }
                
                // Add new content
                await this.notion.appendBlock(pageId, blocks);
              }
            }
            
            results.updatedPages.push({
              id: pageId,
              title: enhanced.title || pageData.title,
              action: "updated",
              properties: Object.keys(updatePayload.properties),
              contentAdded: !!(enhanced.content || enhanced.summary),
            });
            
          } catch (error) {
            results.errors.push({
              error: error.message,
              pageData,
            });
          }
        }
      }
      
      // Process any remaining enhanced records that didn't match created pages
      for (const enhanced of enhancedData) {
        if (enhanced.pageId && !results.updatedPages.find(p => p.id === enhanced.pageId)) {
          try {
            const existingPage = await this.notion.retrievePage(enhanced.pageId);
            
            const updatePayload = {
              properties: await this.buildPageProperties(enhanced, existingPage),
            };
            
            if (this.parentPageId) {
              updatePayload.parent = {
                type: "page_id", 
                page_id: this.parentPageId,
              };
            }
            
            await this.notion.updatePage(enhanced.pageId, updatePayload);
            
            // Handle content
            if (enhanced.content || enhanced.summary) {
              const blocks = await this.buildPageBlocks(enhanced);
              
              if (blocks.length > 0) {
                if (this.replaceContent) {
                  await this.clearPageContent(enhanced.pageId);
                }
                await this.notion.appendBlock(enhanced.pageId, blocks);
              }
            }
            
            results.updatedPages.push({
              id: enhanced.pageId,
              title: enhanced.title,
              action: "updated",
              contentAdded: !!(enhanced.content || enhanced.summary),
            });
            
          } catch (error) {
            results.errors.push({
              error: error.message,
              enhancedData: enhanced,
            });
          }
        }
      }
      
      // Generate summary
      results.summary = {
        totalProcessed: enhancedData.length,
        pagesUpdated: results.updatedPages.length,
        errors: results.errors.length,
        contentReplaced: this.replaceContent,
        parentSet: !!this.parentPageId,
        knowledgeBaseTitle: this.knowledgeBaseTitle,
      };
      
      $.export("$summary", `Successfully updated ${results.updatedPages.length} Notion pages with enhanced content. ${results.errors.length} errors occurred.`);
      
      return results;
      
    } catch (error) {
      throw new Error(`Failed to update Notion pages: ${error.message}`);
    }
  },
})