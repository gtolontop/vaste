-- Diagnostic debug print script for Vaste mod loader

print("DEBUG_PRINT: simple string")
print("DEBUG_PRINT: number", 42)
print("DEBUG_PRINT: vector-like", { x = 1, y = 2, z = 3 })

-- Attempt to access js global if present
if js ~= nil then
    print("DEBUG_PRINT: js global exists")
    -- try to print a JS value
    local ok, val = pcall(function() return js.global end)
    if ok then
        print("DEBUG_PRINT: js.global available")
    else
        print("DEBUG_PRINT: js.global access failed")
    end
else
    print("DEBUG_PRINT: js global is nil")
end
