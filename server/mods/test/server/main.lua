-- Test Mod Server Script
-- Creates a test world and handles player connections

print("Test mod server script loaded")

-- Create a moderately sized test world for performance testing
local testworld = CreateWorld(128, 128) -- Monde un peu plus grand pour tester render distance
FillBlocksInWorld(testworld, vec3(0, 0, 0), vec3(64, 1, 64)) -- Sol de 64x64

-- Quelques structures pour tester la render distance
FillBlocksInWorld(testworld, vec3(10, 2, 10), vec3(15, 5, 15)) -- Maison 1
FillBlocksInWorld(testworld, vec3(30, 2, 30), vec3(35, 4, 35)) -- Maison 2
FillBlocksInWorld(testworld, vec3(50, 2, 50), vec3(55, 6, 55)) -- Tour

-- Structure distante pour tester la render distance
FillBlocksInWorld(testworld, vec3(100, 2, 100), vec3(110, 10, 110)) -- Structure distante

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