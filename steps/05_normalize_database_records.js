import { axios } from "@pipedream/platform"

export default defineComponent({
  name: "Normalize Database Records",
  description: "Standardize field names, data types, and formats from cleaned data to ensure consistent database population structure",
  type: "action",
  props: {
    records: {
      type: "string[]",
      label: "Records to Normalize",
      description: "Array of cleaned records to normalize. Each record should be a JSON string containing the data to standardize."
    },
    titleFields: {
      type: "string[]",
      label: "Title Field Names",
      description: "Possible field names that contain title data (e.g., 'title', 'name', 'subject', 'heading')",
      default: ["title", "name", "subject", "heading", "summary"],
      optional: true
    },
    contentFields: {
      type: "string[]", 
      label: "Content Field Names",
      description: "Possible field names that contain content data (e.g., 'content', 'body', 'description', 'text')",
      default: ["content", "body", "description", "text", "details", "message"],
      optional: true
    },
    categoryFields: {
      type: "string[]",
      label: "Category Field Names", 
      description: "Possible field names that contain category data (e.g., 'category', 'type', 'classification')",
      default: ["category", "type", "classification", "genre", "department"],
      optional: true
    },
    statusFields: {
      type: "string[]",
      label: "Status Field Names",
      description: "Possible field names that contain status data (e.g., 'status', 'state', 'condition')",
      default: ["status", "state", "condition", "phase", "stage"],
      optional: true
    },
    priorityFields: {
      type: "string[]",
      label: "Priority Field Names",
      description: "Possible field names that contain priority data (e.g., 'priority', 'importance', 'urgency')",
      default: ["priority", "importance", "urgency", "severity", "level"],
      optional: true
    },
    sourceFields: {
      type: "string[]",
      label: "Source Field Names",
      description: "Possible field names that contain source data (e.g., 'source', 'origin', 'platform')",
      default: ["source", "origin", "platform", "channel", "provider"],
      optional: true
    },
    dateFields: {
      type: "string[]",
      label: "Date Field Names",
      description: "Possible field names that contain date data (e.g., 'date', 'created_at', 'timestamp')",
      default: ["date", "created_at", "updated_at", "timestamp", "time", "published_at"],
      optional: true
    },
    tagsFields: {
      type: "string[]",
      label: "Tags Field Names", 
      description: "Possible field names that contain tags data (e.g., 'tags', 'keywords', 'labels')",
      default: ["tags", "keywords", "labels", "hashtags", "topics"],
      optional: true
    }
  },
  methods: {
    findFieldValue(record, fieldNames) {
      // Case-insensitive field matching
      for (const fieldName of fieldNames) {
        const keys = Object.keys(record);
        const matchedKey = keys.find(key => 
          key.toLowerCase() === fieldName.toLowerCase()
        );
        if (matchedKey && record[matchedKey] !== null && record[matchedKey] !== undefined) {
          return record[matchedKey];
        }
      }
      return null;
    },
    
    normalizeDate(dateValue) {
      if (!dateValue) return null;
      
      try {
        // Handle various date formats
        let date;
        if (typeof dateValue === 'string') {
          // Try parsing common date formats
          date = new Date(dateValue);
        } else if (typeof dateValue === 'number') {
          // Handle timestamp (both seconds and milliseconds)
          date = dateValue > 1000000000000 ? new Date(dateValue) : new Date(dateValue * 1000);
        } else {
          date = new Date(dateValue);
        }
        
        // Validate the date
        if (isNaN(date.getTime())) {
          return null;
        }
        
        return date.toISOString();
      } catch (error) {
        return null;
      }
    },
    
    normalizeTags(tagsValue) {
      if (!tagsValue) return [];
      
      // Handle different tag formats
      if (Array.isArray(tagsValue)) {
        return tagsValue.map(tag => String(tag).trim()).filter(tag => tag.length > 0);
      }
      
      if (typeof tagsValue === 'string') {
        // Split by common delimiters and clean up
        const delimiters = [',', ';', '|', '\n', '\t'];
        let tags = [tagsValue];
        
        for (const delimiter of delimiters) {
          tags = tags.flatMap(tag => tag.split(delimiter));
        }
        
        return tags.map(tag => tag.trim()).filter(tag => tag.length > 0);
      }
      
      return [String(tagsValue).trim()].filter(tag => tag.length > 0);
    },
    
    normalizeStatus(statusValue) {
      if (!statusValue) return 'unknown';
      
      const status = String(statusValue).toLowerCase().trim();
      
      // Common status mappings
      const statusMappings = {
        'active': 'active',
        'inactive': 'inactive',
        'pending': 'pending',
        'completed': 'completed',
        'draft': 'draft',
        'published': 'published',
        'archived': 'archived',
        'deleted': 'deleted',
        'open': 'open',
        'closed': 'closed',
        'in_progress': 'in_progress',
        'in progress': 'in_progress',
        'todo': 'todo',
        'done': 'completed'
      };
      
      return statusMappings[status] || status;
    },
    
    normalizePriority(priorityValue) {
      if (!priorityValue) return 'medium';
      
      const priority = String(priorityValue).toLowerCase().trim();
      
      // Common priority mappings
      const priorityMappings = {
        'low': 'low',
        'medium': 'medium',
        'high': 'high',
        'urgent': 'urgent',
        'critical': 'critical',
        '1': 'low',
        '2': 'medium', 
        '3': 'high',
        '4': 'urgent',
        '5': 'critical',
        'minor': 'low',
        'major': 'high',
        'blocker': 'critical'
      };
      
      return priorityMappings[priority] || priority;
    }
  },
  async run({ $ }) {
    if (!this.records || this.records.length === 0) {
      $.export("$summary", "No records provided for normalization");
      return [];
    }
    
    const normalizedRecords = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < this.records.length; i++) {
      try {
        // Parse the record if it's a JSON string
        let record;
        if (typeof this.records[i] === 'string') {
          record = JSON.parse(this.records[i]);
        } else {
          record = this.records[i];
        }
        
        // Create normalized record with standard schema
        const normalizedRecord = {
          id: record.id || `record_${Date.now()}_${i}`,
          title: this.findFieldValue(record, this.titleFields) || 'Untitled',
          content: this.findFieldValue(record, this.contentFields) || '',
          category: this.findFieldValue(record, this.categoryFields) || 'uncategorized',
          tags: this.normalizeTags(this.findFieldValue(record, this.tagsFields)),
          status: this.normalizeStatus(this.findFieldValue(record, this.statusFields)),
          priority: this.normalizePriority(this.findFieldValue(record, this.priorityFields)),
          source: this.findFieldValue(record, this.sourceFields) || 'unknown',
          date: this.normalizeDate(this.findFieldValue(record, this.dateFields)),
          created_at: new Date().toISOString(),
          metadata: {}
        };
        
        // Store any additional fields in metadata
        Object.keys(record).forEach(key => {
          const isStandardField = [
            ...this.titleFields,
            ...this.contentFields, 
            ...this.categoryFields,
            ...this.tagsFields,
            ...this.statusFields,
            ...this.priorityFields,
            ...this.sourceFields,
            ...this.dateFields,
            'id'
          ].some(field => key.toLowerCase() === field.toLowerCase());
          
          if (!isStandardField) {
            normalizedRecord.metadata[key] = record[key];
          }
        });
        
        normalizedRecords.push(normalizedRecord);
        successCount++;
        
      } catch (error) {
        console.error(`Error normalizing record ${i}:`, error.message);
        errorCount++;
      }
    }
    
    $.export("$summary", `Successfully normalized ${successCount} records${errorCount > 0 ? `, ${errorCount} errors` : ''}`);
    
    return {
      normalized_records: normalizedRecords,
      summary: {
        total_input: this.records.length,
        successfully_normalized: successCount,
        errors: errorCount,
        normalization_timestamp: new Date().toISOString()
      }
    };
  }
})