import openai from "@pipedream/openai"

export default defineComponent({
  name: "Enhance Records with AI",
  description: "Use OpenAI to enhance individual records with professional titles, detailed summaries, categorization, and suggested tags",
  type: "action",
  props: {
    openai,
    records: {
      type: "string[]",
      label: "Records",
      description: "Array of normalized records to enhance (each record should be a JSON object as a string)"
    },
    model: {
      propDefinition: [
        openai,
        "chatCompletionModelId"
      ],
      default: "gpt-3.5-turbo"
    },
    includeRelatedDocuments: {
      type: "boolean",
      label: "Include Related Documents Suggestions",
      description: "Whether to generate suggestions for related documents",
      default: false
    },
    customSections: {
      type: "string[]",
      label: "Custom Sections",
      description: "Additional custom sections to generate for each record (e.g., 'key_insights', 'action_items', 'risk_assessment')",
      optional: true
    }
  },
  async run({ $ }) {
    const enhancedRecords = []

    for (const recordStr of this.records) {
      try {
        const record = JSON.parse(recordStr)
        
        // Build the enhancement prompt
        let prompt = `Analyze the following record and enhance it with professional content. Return your response as a JSON object with the following structure:

{
  "enhanced_title": "A professional, descriptive title",
  "detailed_summary": "A comprehensive summary of the content",
  "categories": ["category1", "category2", "category3"],
  "suggested_tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "priority_level": "High|Medium|Low",
  "content_type": "Document|Email|Report|Note|Other"`

        if (this.includeRelatedDocuments) {
          prompt += `,
  "related_documents": ["suggestion1", "suggestion2", "suggestion3"]`
        }

        if (this.customSections && this.customSections.length > 0) {
          for (const section of this.customSections) {
            prompt += `,
  "${section}": "Generated content for ${section}"`
          }
        }

        prompt += `
}

Record to analyze:
${JSON.stringify(record, null, 2)}

Focus on extracting meaningful insights and creating professional, actionable content. Ensure categories are broad but specific enough to be useful for organization. Tags should be relevant keywords that would help with search and filtering.`

        const completion = await this.openai.createChatCompletion({
          data: {
            model: this.model,
            messages: [
              {
                role: "system",
                content: "You are a professional content analyzer and enhancer. You specialize in creating clear, professional titles, comprehensive summaries, and useful categorization for various types of records and documents. Always respond with valid JSON."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 1000
          }
        })

        const enhancementText = completion.generated_message?.content
        if (!enhancementText) {
          throw new Error("No enhancement generated")
        }

        let enhancement
        try {
          enhancement = JSON.parse(enhancementText)
        } catch (parseError) {
          // If JSON parsing fails, create a basic enhancement
          enhancement = {
            enhanced_title: `Enhanced: ${record.title || record.name || "Untitled Record"}`,
            detailed_summary: enhancementText.substring(0, 300) + "...",
            categories: ["General"],
            suggested_tags: ["unprocessed"],
            priority_level: "Medium",
            content_type: "Other"
          }
        }

        // Merge original record with enhancements
        const enhancedRecord = {
          ...record,
          ...enhancement,
          original_title: record.title || record.name,
          enhancement_timestamp: new Date().toISOString(),
          model_used: this.model
        }

        enhancedRecords.push(enhancedRecord)

      } catch (error) {
        $.export("error", `Failed to enhance record: ${error.message}`)
        
        // Add the original record with error info
        let originalRecord
        try {
          originalRecord = JSON.parse(recordStr)
        } catch {
          originalRecord = { raw_content: recordStr }
        }

        enhancedRecords.push({
          ...originalRecord,
          enhancement_error: error.message,
          enhancement_timestamp: new Date().toISOString(),
          enhanced_title: originalRecord.title || originalRecord.name || "Enhancement Failed",
          detailed_summary: "Enhancement failed - original content preserved",
          categories: ["Error"],
          suggested_tags: ["enhancement_failed"],
          priority_level: "Medium",
          content_type: "Other"
        })
      }
    }

    $.export("$summary", `Successfully enhanced ${enhancedRecords.length} records using ${this.model}`)

    return {
      enhanced_records: enhancedRecords,
      total_processed: this.records.length,
      enhancement_settings: {
        model: this.model,
        include_related_documents: this.includeRelatedDocuments,
        custom_sections: this.customSections || []
      }
    }
  }
})