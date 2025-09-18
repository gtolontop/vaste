-- Vaste Mod Manifest
-- This file identifies and configures the mod for the Vaste game server

name("test")
description("This is a test mod")
version("beta 1.0.0")
author("vaste")

load_client_script("client/main.lua")
-- try Lua first (requires fengari); fallback to JS if Lua fails or is unavailable
load_server_script("server/debug_print.lua")
load_server_script("server/main.lua")
