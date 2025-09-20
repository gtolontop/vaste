import React, { useState, useEffect } from "react";
import { allFunctions } from "../data/vastefunctions/index";
import "./VasteFunctionsPage.css";

interface FunctionParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface FunctionReturn {
  type: string;
  description: string;
}

interface VasteFunction {
  name: string;
  category: string;
  description: string;
  syntax: string;
  parameters: FunctionParameter[];
  returns: FunctionReturn;
  example: string;
  notes: string[];
}

const VasteFunctionsPage: React.FC = () => {
  const [functions, setFunctions] = useState<VasteFunction[]>([]);
  const [selectedFunction, setSelectedFunction] = useState<VasteFunction | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchTerm, setSearchTerm] = useState<string>("");

  useEffect(() => {
    loadFunctions();
  }, []);

  const loadFunctions = async () => {
    try {
      setFunctions(allFunctions);
      if (allFunctions.length > 0) {
        setSelectedFunction(allFunctions[0]);
      }
    } catch (error) {
      console.error("Error loading functions:", error);
    }
  };

  const categories = ["All", ...Array.from(new Set(functions.map((f) => f.category)))];

  const filteredFunctions = functions.filter((func) => {
    const matchesCategory = selectedCategory === "All" || func.category === selectedCategory;
    const matchesSearch = func.name.toLowerCase().includes(searchTerm.toLowerCase()) || func.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const formatCodeExample = (code: string) => {
    return code.split("\n").map((line, index) => {
      const tokens = [];
      let currentIndex = 0;
      const text = line;

      // Simple tokenizer for Lua syntax
      while (currentIndex < text.length) {
        let matched = false;

        // Check for comments
        if (text.substring(currentIndex, currentIndex + 2) === "--") {
          const restOfLine = text.substring(currentIndex);
          tokens.push(
            <span key={`${index}-${currentIndex}`} className="lua-comment">
              {restOfLine}
            </span>
          );
          break;
        }

        // Check for strings
        if (text[currentIndex] === '"' || text[currentIndex] === "'") {
          const quote = text[currentIndex];
          let endIndex = currentIndex + 1;
          while (endIndex < text.length && text[endIndex] !== quote) {
            endIndex++;
          }
          if (endIndex < text.length) endIndex++; // Include closing quote
          const stringContent = text.substring(currentIndex, endIndex);
          tokens.push(
            <span key={`${index}-${currentIndex}`} className="lua-string">
              {stringContent}
            </span>
          );
          currentIndex = endIndex;
          matched = true;
        }

        // Check for keywords
        const keywordRegex = /^(local|function|end|if|then|else|elseif|while|do|for|in|repeat|until|break|return|and|or|not|true|false|nil)\b/;
        const keywordMatch = text.substring(currentIndex).match(keywordRegex);
        if (!matched && keywordMatch) {
          tokens.push(
            <span key={`${index}-${currentIndex}`} className="lua-keyword">
              {keywordMatch[0]}
            </span>
          );
          currentIndex += keywordMatch[0].length;
          matched = true;
        }

        // Check for numbers
        const numberRegex = /^\d+\.?\d*/;
        const numberMatch = text.substring(currentIndex).match(numberRegex);
        if (!matched && numberMatch && /\d/.test(numberMatch[0])) {
          tokens.push(
            <span key={`${index}-${currentIndex}`} className="lua-number">
              {numberMatch[0]}
            </span>
          );
          currentIndex += numberMatch[0].length;
          matched = true;
        }

        // Check for function names
        const functionRegex = /^[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/;
        const functionMatch = text.substring(currentIndex).match(functionRegex);
        if (!matched && functionMatch) {
          tokens.push(
            <span key={`${index}-${currentIndex}`} className="lua-function">
              {functionMatch[0]}
            </span>
          );
          currentIndex += functionMatch[0].length;
          matched = true;
        }

        // Default: add character as-is
        if (!matched) {
          tokens.push(text[currentIndex]);
          currentIndex++;
        }
      }

      return (
        <div key={index} className="code-line">
          {tokens}
        </div>
      );
    });
  };

  return (
    <div className="vaste-functions-page">
      <div className="functions-content">
        {/* Sidebar */}
        <div className="functions-sidebar">
          <div className="search-section">
            <input type="text" placeholder="Search functions..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
          </div>

          <div className="category-filter">
            <label>Category:</label>
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="category-select">
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div className="functions-list">
            {filteredFunctions.map((func) => (
              <div key={func.name} className={`function-item ${selectedFunction?.name === func.name ? "selected" : ""}`} onClick={() => setSelectedFunction(func)}>
                <div className="function-name">{func.name}</div>
                <div className="function-category">{func.category}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Documentation Panel */}
        <div className="functions-documentation">
          {selectedFunction ? (
            <div className="function-details">
              <div className="function-header">
                <h2>{selectedFunction.name}</h2>
                <span className="category-badge">{selectedFunction.category}</span>
              </div>

              <div className="function-section">
                <h3>Description</h3>
                <p>{selectedFunction.description}</p>
              </div>

              <div className="function-section">
                <h3>Syntax</h3>
                <code className="syntax-code">{selectedFunction.syntax}</code>
              </div>

              <div className="function-section">
                <h3>Parameters</h3>
                {selectedFunction.parameters.length > 0 ? (
                  <div className="parameters-table">
                    {selectedFunction.parameters.map((param, index) => (
                      <div key={index} className="parameter-row">
                        <div className="parameter-name">
                          <code>{param.name}</code>
                          {param.required && <span className="required">*</span>}
                        </div>
                        <div className="parameter-type">
                          <span className="type-badge">{param.type}</span>
                        </div>
                        <div className="parameter-description">{param.description}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No parameters required.</p>
                )}
              </div>

              <div className="function-section">
                <h3>Returns</h3>
                <div className="return-info">
                  <span className="type-badge">{selectedFunction.returns.type}</span>
                  <span className="return-description">{selectedFunction.returns.description}</span>
                </div>
              </div>

              <div className="function-section">
                <h3>Example</h3>
                <pre className="code-example">{formatCodeExample(selectedFunction.example)}</pre>
              </div>

              {selectedFunction.notes.length > 0 && (
                <div className="function-section">
                  <h3>Notes</h3>
                  <ul className="notes-list">
                    {selectedFunction.notes.map((note, index) => (
                      <li key={index}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="no-selection">
              <h2>Select a function to view documentation</h2>
              <p>Choose a function from the list on the left to see detailed documentation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VasteFunctionsPage;
