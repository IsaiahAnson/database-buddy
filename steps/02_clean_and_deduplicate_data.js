import { axios } from "@pipedream/platform"

export default defineComponent({
  name: "Clean and Deduplicate OneDrive Data",
  description: "Clean and deduplicate data from OneDrive documents, Excel files, and OneNote content with configurable similarity detection and batch processing",
  type: "action",
  props: {
    data_store: {
      type: "data_store",
      label: "Data Store",
      description: "Store for tracking processed batches and deduplication across runs"
    },
    onedrive_data: {
      type: "object",
      label: "OneDrive Folders Data", 
      description: "Object or array of scanned OneDrive folder data",
      optional: true
    },
    excel_data: {
      type: "object",
      label: "Excel Files Data",
      description: "Object or array of processed Excel file data", 
      optional: true
    },
    onenote_data: {
      type: "object",
      label: "OneNote Content Data",
      description: "Object or array of extracted OneNote content",
      optional: true
    },
    include_onedrive: {
      type: "boolean",
      label: "Include OneDrive Data",
      description: "Include OneDrive folder scan results in processing",
      default: true
    },
    include_excel: {
      type: "boolean", 
      label: "Include Excel Data",
      description: "Include Excel file data in processing",
      default: true
    },
    include_onenote: {
      type: "boolean",
      label: "Include OneNote Data", 
      description: "Include OneNote content in processing",
      default: true
    },
    similarity_threshold: {
      type: "integer",
      label: "Duplicate Similarity Threshold",
      description: "Percentage threshold for detecting duplicates (0-100). Higher values require more similarity to consider items duplicates",
      default: 80,
      min: 0,
      max: 100
    },
    batch_size: {
      type: "integer",
      label: "Batch Size",
      description: "Number of records to process in each batch",
      default: 10,
      min: 1,
      max: 100
    },
    max_records: {
      type: "integer",
      label: "Maximum Records",
      description: "Maximum number of records to return after deduplication",
      default: 3,
      min: 1,
      max: 50
    },
    use_persistent_storage: {
      type: "boolean",
      label: "Use Persistent Storage",
      description: "Enable persistent storage for batch processing and deduplication state",
      default: false
    }
  },
  methods: {
    cleanText(text) {
      if (!text || typeof text !== 'string') return '';
      return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    },
    
    calculateSimilarity(text1, text2) {
      if (!text1 || !text2) return 0;
      
      const clean1 = this.cleanText(text1);
      const clean2 = this.cleanText(text2);
      
      if (clean1 === clean2) return 100;
      
      const words1 = new Set(clean1.split(' '));
      const words2 = new Set(clean2.split(' '));
      
      const intersection = new Set([...words1].filter(x => words2.has(x)));
      const union = new Set([...words1, ...words2]);
      
      return Math.round((intersection.size / union.size) * 100);
    },
    
    isDuplicate(item, existingItems, threshold) {
      const itemText = this.getTextContent(item);
      
      for (const existing of existingItems) {
        const existingText = this.getTextContent(existing);
        const similarity = this.calculateSimilarity(itemText, existingText);
        
        if (similarity >= threshold) {
          return true;
        }
      }
      return false;
    },
    
    getTextContent(item) {
      if (typeof item === 'string') return item;
      return item.content || item.text || item.name || item.title || JSON.stringify(item);
    },
    
    processInBatches(items, batchSize) {
      const batches = [];
      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }
      return batches;
    },
    
    parseInputData(data) {
      if (!data) return [];
      try {
        // Handle object data directly without JSON parsing
        if (Array.isArray(data)) {
          return data;
        } else if (typeof data === 'object') {
          return [data];
        } else {
          console.warn('Unexpected data type:', typeof data);
          return [];
        }
      } catch (error) {
        console.warn('Failed to process input data:', error.message);
        return [];
      }
    }
  },
  async run({ $ }) {
    // Collect data from enabled sources
    let allData = [];
    
    if (this.include_onedrive && this.onedrive_data) {
      const onedriveItems = this.parseInputData(this.onedrive_data);
      allData.push(...onedriveItems.map(item => ({ ...item, source: 'OneDrive' })));
    }
    
    if (this.include_excel && this.excel_data) {
      const excelItems = this.parseInputData(this.excel_data);  
      allData.push(...excelItems.map(item => ({ ...item, source: 'Excel' })));
    }
    
    if (this.include_onenote && this.onenote_data) {
      const onenoteItems = this.parseInputData(this.onenote_data);
      allData.push(...onenoteItems.map(item => ({ ...item, source: 'OneNote' })));
    }
    
    if (allData.length === 0) {
      $.export("$summary", "No data provided from any enabled sources");
      return { 
        message: "No data to process",
        processed_count: 0,
        deduplicated_count: 0,
        final_records: []
      };
    }
    
    // Initialize processing state (with or without persistent storage)
    let processedBatches = [];
    let deduplicatedItems = [];
    
    // If persistent storage is enabled, load existing state
    if (this.use_persistent_storage && this.data_store) {
      processedBatches = (await this.data_store.get("processed_batches")) || [];
      deduplicatedItems = (await this.data_store.get("deduplicated_items")) || [];
    }
    
    // Process data in batches
    const batches = this.processInBatches(allData, this.batch_size);
    let processedCount = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchId = `batch_${i}_${Date.now()}`;
      
      // Skip if batch already processed (only when using persistent storage)
      if (this.use_persistent_storage && processedBatches.includes(batchId)) {
        continue;
      }
      
      // Clean and deduplicate batch
      for (const item of batch) {
        processedCount++;
        
        // Clean the item
        const cleanedItem = {
          ...item,
          cleaned_content: this.cleanText(this.getTextContent(item)),
          processed_at: new Date().toISOString()
        };
        
        // Check for duplicates
        if (!this.isDuplicate(cleanedItem, deduplicatedItems, this.similarity_threshold)) {
          deduplicatedItems.push(cleanedItem);
        }
        
        // Stop if we've reached max records
        if (deduplicatedItems.length >= this.max_records) {
          break;
        }
      }
      
      // Save batch progress (only if persistent storage is enabled)
      if (this.use_persistent_storage && this.data_store) {
        processedBatches.push(batchId);
        await this.data_store.set("processed_batches", processedBatches);
        await this.data_store.set("deduplicated_items", deduplicatedItems);
      }
      
      // Stop if we've reached max records
      if (deduplicatedItems.length >= this.max_records) {
        break;
      }
    }
    
    // Limit final results
    const finalRecords = deduplicatedItems.slice(0, this.max_records);
    
    const duplicatesRemoved = processedCount - finalRecords.length;
    
    $.export("$summary", `Processed ${processedCount} records, removed ${duplicatesRemoved} duplicates, returning ${finalRecords.length} unique items${this.use_persistent_storage ? ' (using persistent storage)' : ' (in-memory processing)'}`);
    
    return {
      processed_count: processedCount,
      duplicates_removed: duplicatesRemoved,
      deduplicated_count: finalRecords.length,
      similarity_threshold_used: this.similarity_threshold,
      persistent_storage_used: this.use_persistent_storage,
      sources_processed: {
        onedrive: this.include_onedrive && !!this.onedrive_data,
        excel: this.include_excel && !!this.excel_data,
        onenote: this.include_onenote && !!this.onenote_data
      },
      final_records: finalRecords
    };
  }
})