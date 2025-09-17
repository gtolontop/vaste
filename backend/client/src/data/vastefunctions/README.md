# Vaste Functions Documentation

This directory contains the JSON documentation files for all Vaste Lua functions.

## Adding a New Function

To add a new function to the documentation:

1. **Create a new JSON file** in this directory with the function name (e.g., `MyFunction.json`)

2. **Use this template** for the JSON structure:

```json
{
  "name": "FunctionName",
  "category": "Category Name",
  "description": "Brief description of what this function does",
  "syntax": "FunctionName(parameter1, parameter2)",
  "parameters": [
    {
      "name": "parameter1",
      "type": "string|number|boolean|object|array",
      "required": true,
      "description": "Description of this parameter"
    }
  ],
  "returns": {
    "type": "void|string|number|boolean|object",
    "description": "Description of what is returned"
  },
  "example": "-- Example code here\nlocal result = FunctionName(\"example\", 123)\nprint(result)",
  "notes": [
    "Important note 1",
    "Important note 2"
  ]
}
```

3. **Update the index.ts file** to include your new function:
   - Add an import statement
   - Add it to the `allFunctions` array
   - Add it to the export list

4. **Available categories:**
   - Threading
   - World Management
   - Entity Management
   - Events
   - Math
   - Utility
   - (or create a new category)

## Example Function Documentation

See `Wait.json` for a complete example of function documentation.

## File Structure

```
vastefunctions/
├── index.ts              # Auto-imports all functions
├── README.md             # This file
├── Wait.json             # Threading function
├── CreateThread.json     # Threading function
├── CreateWorld.json      # World management function
├── vec3.json             # Math function
└── ...                   # Other function files
```

## Guidelines

- Keep descriptions clear and concise
- Include practical examples in the `example` field
- Use proper Lua syntax in examples
- Add important warnings or tips in the `notes` array
- Use consistent parameter type names
- Test that your JSON is valid before committing