-- Test Mod Server Script
-- Creates a test world and handles player connections

print("Test mod server script loaded")

-- Create or load a persisted world stored under the mod folder at 'savedworld/testworld'
-- This new API will create the folder structure and manage chunk files under that path.
local testworld = CreateOrLoadWorld("savedworld/testworld", "flatworld")

print("Test world created or loaded at 'savedworld/testworld'")

-- Handle player join events
AddEventListener("onPlayerJoin", function(player)
    local playerEntity = GetPlayerEntity(player)
    SetEntityInWorld(playerEntity, testworld)
    print("Player " .. GetPlayerName(player) .. " joined and placed in test world.")
    SetEntityCoords(playerEntity, vec3(0, 50, 0)) -- Centre du monde
    print("Player " .. GetPlayerName(player) .. " positioned at (0, 50, 0).")
end)
