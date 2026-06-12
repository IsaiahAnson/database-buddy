import notion from "@pipedream/notion"

export default defineComponent({
  name: "Create Database at Workspace Level",
  description: "Create a new database at the workspace level to avoid archived ancestor issues",
  type: "action",
  props: {
    notion,
    title: {
      type: "string",
      label: "Database Title",
      description: "The title of the database",
    },
    properties: {
      type: "string[]",
      label: "Properties",
      description: "Define database properties as JSON objects. Each property should be formatted like: `{\"name\": \"Task Name\", \"type\": \"title\"}` or `{\"name\": \"Status\", \"type\": \"select\", \"select\": {\"options\": [{\"name\": \"To Do\", \"color\": \"red\"}, {\"name\": \"Done\", \"color\": \"green\"}]}}`",
    },
    description: {
      type: "string",
      label: "Database Description",
      description: "Optional description for the database",
      optional: true,
    },
  },
  async run({ $ }) {
    // Parse properties from JSON strings
    const parsedProperties = {};
    
    for (const propString of this.properties) {
      try {
        const prop = JSON.parse(propString);
        if (!prop.name || !prop.type) {
          throw new Error("Each property must have a 'name' and 'type' field");
        }
        
        // Create property object for Notion API
        const propertyDef = {
          type: prop.type,
        };
        
        // Add type-specific configuration
        if (prop.type === "select" && prop.select) {
          propertyDef.select = prop.select;
        } else if (prop.type === "multi_select" && prop.multi_select) {
          propertyDef.multi_select = prop.multi_select;
        } else if (prop.type === "number" && prop.number) {
          propertyDef.number = prop.number;
        } else if (prop.type === "date" && prop.date) {
          propertyDef.date = prop.date;
        } else if (prop.type === "people" && prop.people) {
          propertyDef.people = prop.people;
        } else if (prop.type === "files" && prop.files) {
          propertyDef.files = prop.files;
        } else if (prop.type === "checkbox" && prop.checkbox) {
          propertyDef.checkbox = prop.checkbox;
        } else if (prop.type === "url" && prop.url) {
          propertyDef.url = prop.url;
        } else if (prop.type === "email" && prop.email) {
          propertyDef.email = prop.email;
        } else if (prop.type === "phone_number" && prop.phone_number) {
          propertyDef.phone_number = prop.phone_number;
        } else if (prop.type === "relation" && prop.relation) {
          propertyDef.relation = prop.relation;
        } else if (prop.type === "rollup" && prop.rollup) {
          propertyDef.rollup = prop.rollup;
        }
        
        parsedProperties[prop.name] = propertyDef;
      } catch (error) {
        throw new Error(`Invalid JSON in property: ${propString}. Error: ${error.message}`);
      }
    }
    
    // Ensure at least one property exists
    if (Object.keys(parsedProperties).length === 0) {
      throw new Error("At least one property is required");
    }
    
    // Build database object
    const databaseData = {
      parent: {
        type: "workspace",
        workspace: true,
      },
      title: [
        {
          type: "text",
          text: {
            content: this.title,
          },
        },
      ],
      properties: parsedProperties,
    };
    
    // Add description if provided
    if (this.description) {
      databaseData.description = [
        {
          type: "text",
          text: {
            content: this.description,
          },
        },
      ];
    }
    
    // Create the database
    const database = await this.notion.createDatabase(databaseData);
    
    $.export("$summary", `Successfully created database "${this.title}" at workspace level`);
    
    return database;
  },
})