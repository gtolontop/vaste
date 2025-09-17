-- Test Mod Server Script
-- Creates a test world and handles player connections

print("Test mod server script loaded")

-- Create the test world
local testworld = CreateWorld(32, 32) -- the world size
FillBlocksInWorld(testworld, vec3(0, 0, 0), vec3(16, 1, 16))

print("Test world created with size 32x32")

-- Handle player join events
AddEventListener("onPlayerJoin", function(player)
    print("Player " .. player.username .. " joined the test world")
    
    local playerEntity = GetPlayerEntity(player)
    SetEntityInWorld(playerEntity, testworld)
    SetEntityCoords(playerEntity, vec3(1, 2, 1)) -- Center of the world, elevated

    -- Create a thread to move the player continuously
    CreateThread(function()
        local x = 1
        while true do
            Wait(1000)
            SetEntityCoords(playerEntity, vec3(x, 2, 1))
            x = x + 1
            if x > 30 then
                x = 1 -- Reset position to avoid going too far
            end
        end
    end)
    
    print("Player " .. player.username .. " spawned and movement thread started")
end)