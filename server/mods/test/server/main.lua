-- Test Mod Server Script
-- Creates a test world and handles player connections

print("Test mod server script loaded")

-- Create or load a persisted world stored under the mod folder at 'savedworld/testworld'
-- This new API will create the folder structure and manage chunk files under that path.
local testworld = CreateOrLoadWorld("savedworld/testworld", "flatworld")

print("Medium test world created - optimized for 10 chunk render distance")

-- Handle player join events
AddEventListener("onPlayerJoin", function(player)
    print("Player " .. player.username .. " joined the medium test world")
    
    local playerEntity = GetPlayerEntity(player)
    SetEntityInWorld(playerEntity, testworld)
    SetEntityCoords(playerEntity, vec3(32, 2, 32)) -- Centre du monde

    print("Player " .. player.username .. " spawned in optimized world")
end)
FillBlocksInWorld(testworld, vec3(20, 2, 20), vec3(25, 4, 25)) -- Petite maison 2

print("Small test world created - optimized for performance")

-- Handle player join events
AddEventListener("onPlayerJoin", function(player)
    print("Player " .. player.username .. " joined the small test world")
    
    local playerEntity = GetPlayerEntity(player)
    SetEntityInWorld(playerEntity, testworld)
    SetEntityCoords(playerEntity, vec3(16, 2, 16)) -- Plus près du sol

    print("Player " .. player.username .. " spawned in optimized world")
end)