import notion from "@pipedream/notion"

export default defineComponent({
  name: "Populate IT Databases in Notion",
  description: "Create pages in specialized IT databases in Notion with cleaned data from previous steps, organizing content by categories like Network Infrastructure, VDI, Applications, Hardware, Security, etc.",
  type: "action",
  props: {
    notion,
    cleanedData: {
      type: "string[]",
      label: "Cleaned Data",
      description: "Array of cleaned data objects to populate in Notion databases. Each object should contain: category, title, source, content_type, tags, content_summary, and content",
    },
    networkInfrastructureDb: {
      propDefinition: [
        notion,
        "dataSourceId",
      ],
      label: "Network Infrastructure Database ID",
      description: "The Notion database ID for Network Infrastructure content",
      optional: true,
    },
    vdiDb: {
      propDefinition: [
        notion,
        "dataSourceId",
      ],
      label: "VDI Database ID", 
      description: "The Notion database ID for VDI content",
      optional: true,
    },
    applicationsDb: {
      propDefinition: [
        notion,
        "dataSourceId",
      ],
      label: "Applications Database ID",
      description: "The Notion database ID for Applications content", 
      optional: true,
    },
    hardwareDb: {
      propDefinition: [
        notion,
        "dataSourceId",
      ],
      label: "Hardware Database ID",
      description: "The Notion database ID for Hardware content",
      optional: true,
    },
    securityDb: {
      propDefinition: [
        notion,
        "dataSourceId",
      ],
      label: "Security Database ID",
      description: "The Notion database ID for Security content",
      optional: true,
    },
    mdmDb: {
      propDefinition: [
        notion,
        "dataSourceId",
      ],
      label: "MDM Database ID",
      description: "The Notion database ID for MDM content",
      optional: true,
    },
    cloudServicesDb: {
      propDefinition: [
        notion,
        "dataSourceId",
      ],
      label: "Cloud Services Database ID",
      description: "The Notion database ID for Cloud Services content",
      optional: true,
    },
    backupRecoveryDb: {
      propDefinition: [
        notion,
        "dataSourceId",
      ],
      label: "Backup Recovery Database ID",
      description: "The Notion database ID for Backup Recovery content",
      optional: true,
    },
    userManagementDb: {
      propDefinition: [
        notion,
        "dataSourceId",
      ],
      label: "User Management Database ID",
      description: "The Notion database ID for User Management content",
      optional: true,
    },
    monitoringDb: {
      propDefinition: [
        notion,
        "dataSourceId",
      ],
      label: "Monitoring Database ID",
      description: "The Notion database ID for Monitoring content",
      optional: true,
    },
  },
  methods: {
    getDatabaseMapping() {
      return {
        "Network Infrastructure": this.networkInfrastructureDb,
        "VDI": this.vdiDb,
        "Applications": this.applicationsDb,
        "Hardware": this.hardwareDb,
        "Security": this.securityDb,
        "MDM": this.mdmDb,
        "Cloud Services": this.cloudServicesDb,
        "Backup Recovery": this.backupRecoveryDb,
        "User Management": this.userManagementDb,
        "Monitoring": this.monitoringDb,
      };
    },
    normalizeCategory(category) {
      const categoryMap = {
        "network": "Network Infrastructure",
        "networking": "Network Infrastructure",
        "infrastructure": "Network Infrastructure",
        "vdi": "VDI",
        "virtual desktop": "VDI",
        "app": "Applications",
        "application": "Applications",
        "software": "Applications",
        "hardware": "Hardware",
        "device": "Hardware",
        "equipment": "Hardware",
        "security": "Security",
        "cybersecurity": "Security",
        "mdm": "MDM",
        "mobile device": "MDM",
        "cloud": "Cloud Services",
        "aws": "Cloud Services",
        "azure": "Cloud Services",
        "backup": "Backup Recovery",
        "recovery": "Backup Recovery",
        "disaster recovery": "Backup Recovery",
        "user": "User Management",
        "identity": "User Management",
        "access": "User Management",
        "monitor": "Monitoring",
        "monitoring": "Monitoring",
        "observability": "Monitoring",
      };
      
      const lowerCategory = category.toLowerCase();
      return categoryMap[lowerCategory] || category;
    },
    createPageProperties(dataItem) {
      const currentDate = new Date().toISOString();
      
      return {
        "Name": {
          title: [
            {
              text: {
                content: dataItem.title || "Untitled",
              },
            },
          ],
        },
        "Source": {
          rich_text: [
            {
              text: {
                content: dataItem.source || "",
              },
            },
          ],
        },
        "Category": {
          select: {
            name: dataItem.category || "",
          },
        },
        "Content Type": {
          select: {
            name: dataItem.content_type || "",
          },
        },
        "Tags": {
          multi_select: (dataItem.tags || []).map(tag => ({ name: tag })),
        },
        "Created Date": {
          date: {
            start: currentDate,
          },
        },
        "Last Modified": {
          date: {
            start: currentDate,
          },
        },
        "Content Summary": {
          rich_text: [
            {
              text: {
                content: dataItem.content_summary || "",
              },
            },
          ],
        },
      };
    },
    createPageContent(content) {
      if (!content) return [];
      
      return [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: content.substring(0, 2000), // Limit content length
                },
              },
            ],
          },
        },
      ];
    },
  },
  async run({ $ }) {
    const databaseMapping = this.getDatabaseMapping();
    const results = {
      created: [],
      errors: [],
      summary: {},
    };

    for (const dataString of this.cleanedData) {
      try {
        const dataItem = JSON.parse(dataString);
        
        // Normalize and map category to database
        const normalizedCategory = this.normalizeCategory(dataItem.category || "");
        const dataSourceId = databaseMapping[normalizedCategory];
        
        if (!dataSourceId) {
          results.errors.push({
            item: dataItem,
            error: `No database configured for category: ${normalizedCategory}`,
          });
          continue;
        }

        // Create page properties
        const properties = this.createPageProperties({
          ...dataItem,
          category: normalizedCategory,
        });

        // Create page content
        const children = this.createPageContent(dataItem.content);

        // Create the page
        const page = await this.notion.createPage({
          parent: {
            data_source_id: dataSourceId,
          },
          properties,
          children,
        });

        results.created.push({
          id: page.id,
          title: dataItem.title || "Untitled",
          category: normalizedCategory,
          database: dataSourceId,
        });

        // Update summary counts
        if (!results.summary[normalizedCategory]) {
          results.summary[normalizedCategory] = 0;
        }
        results.summary[normalizedCategory]++;

      } catch (error) {
        results.errors.push({
          item: dataString,
          error: error.message,
        });
      }
    }

    const totalCreated = results.created.length;
    const totalErrors = results.errors.length;
    const categoryCount = Object.keys(results.summary).length;

    $.export("$summary", `Successfully created ${totalCreated} pages across ${categoryCount} IT categories. ${totalErrors} errors encountered.`);

    return {
      success: true,
      created_count: totalCreated,
      error_count: totalErrors,
      categories_populated: results.summary,
      created_pages: results.created,
      errors: results.errors,
    };
  },
})