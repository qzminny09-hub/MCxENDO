-- Minecraft x Endorphin Vice World Sync
-- UE4SS Lua script for Endorphin Vice side

local mc_ev_worldsync = {}

-- Configuration
mc_ev_worldsync.config = {
    pipe_name = "minecraft_ev_sync",
    sync_radius = 5000, -- UE units (50 meters)
    heartbeat_interval = 5000, -- ms
    auto_connect = true
}

-- Block registry (mirrors blocks.json)
mc_ev_worldsync.block_registry = {
    ["minecraft:stone"] = {
        mesh_path = "/Game/EndorphinVice/Meshes/Blocks/SM_StoneBlock.SM_StoneBlock",
        material_path = "/Game/EndorphinVice/Materials/M_Stone.M_Stone",
        physics_type = "static",
        mass_kg = 50,
        sync_priority = 1
    },
    ["minecraft:dirt"] = {
        mesh_path = "/Game/EndorphinVice/Meshes/Blocks/SM_DirtBlock.SM_DirtBlock",
        material_path = "/Game/EndorphinVice/Materials/M_Dirt.M_Dirt",
        physics_type = "static",
        mass_kg = 30,
        sync_priority = 1
    },
    ["minecraft:grass_block"] = {
        mesh_path = "/Game/EndorphinVice/Meshes/Blocks/SM_GrassBlock.SM_GrassBlock",
        material_path = "/Game/EndorphinVice/Materials/M_Grass.M_Grass",
        physics_type = "static",
        mass_kg = 35,
        sync_priority = 1
    },
    ["minecraft:oak_log"] = {
        mesh_path = "/Game/EndorphinVice/Meshes/Blocks/SM_OakLog.SM_OakLog",
        material_path = "/Game/EndorphinVice/Materials/M_Wood_Oak.M_Wood_Oak",
        physics_type = "static",
        mass_kg = 80,
        sync_priority = 1
    },
    ["minecraft:oak_planks"] = {
        mesh_path = "/Game/EndorphinVice/Meshes/Blocks/SM_OakPlanks.SM_OakPlanks",
        material_path = "/Game/EndorphinVice/Materials/M_Wood_Oak.M_Wood_Oak",
        physics_type = "static",
        mass_kg = 40,
        sync_priority = 1
    },
    ["minecraft:glass"] = {
        mesh_path = "/Game/EndorphinVice/Meshes/Blocks/SM_GlassBlock.SM_GlassBlock",
        material_path = "/Game/EndorphinVice/Materials/M_Glass.M_Glass",
        physics_type = "static",
        mass_kg = 20,
        sync_priority = 2
    },
    ["minecraft:sand"] = {
        mesh_path = "/Game/EndorphinVice/Meshes/Blocks/SM_SandBlock.SM_SandBlock",
        material_path = "/Game/EndorphinVice/Materials/M_Sand.M_Sand",
        physics_type = "dynamic",
        mass_kg = 25,
        sync_priority = 1
    },
    ["minecraft:gravel"] = {
        mesh_path = "/Game/EndorphinVice/Meshes/Blocks/SM_GravelBlock.SM_GravelBlock",
        material_path = "/Game/EndorphinVice/Materials/M_Gravel.M_Gravel",
        physics_type = "dynamic",
        mass_kg = 30,
        sync_priority = 1
    },
    ["minecraft:tnt"] = {
        mesh_path = "/Game/EndorphinVice/Meshes/Blocks/SM_TNTBlock.SM_TNTBlock",
        material_path = "/Game/EndorphinVice/Materials/M_TNT.M_TNT",
        physics_type = "explosive",
        mass_kg = 100,
        sync_priority = 1
    }
}

-- Runtime state
mc_ev_worldsync.state = {
    pipe_handle = nil,
    connected = false,
    physics_objects = {}, -- actor_id -> {actor, block_id, mesh_comp}
    next_actor_id = 1,
    pending_requests = {}, -- request_id -> callback
    heartbeat_timer = nil,
    reader_thread = nil
}

-- Named pipe server (Windows)
local function create_pipe_server(pipe_name)
    local pipe_path = "\\\\.\\pipe\\" .. pipe_name
    -- In UE4SS, we'd use the Win32 API via LuaJIT FFI
    -- This is a simplified version - actual implementation needs FFI
    return pipe_path
end

-- JSON helpers
local json = require("dkjson")

-- Send message to Minecraft
function mc_ev_worldsync.send_to_mc(message)
    if not mc_ev_worldsync.state.connected or not mc_ev_worldsync.state.pipe_handle then
        return false
    end
    
    local msg_str = json.encode(message) .. "\n"
    -- Write to pipe (requires FFI in actual implementation)
    -- WriteFile(pipe_handle, msg_str, #msg_str, nil, nil)
    return true
end

-- Handle incoming message from Minecraft
function mc_ev_worldsync.handle_mc_message(msg_str)
    local ok, msg = pcall(json.decode, msg_str)
    if not ok then
        print("[MC-EV] Failed to parse message: " .. msg_str)
        return
    end
    
    local msg_type = msg.type
    
    if msg_type == "block_placed" then
        mc_ev_worldsync.on_block_placed(msg)
    elseif msg_type == "block_broken" then
        mc_ev_worldsync.on_block_broken(msg)
    elseif msg_type == "sync_request" then
        mc_ev_worldsync.on_sync_request(msg)
    elseif msg_type == "heartbeat" then
        -- Acknowledge
    end
end

-- Block placed in Minecraft -> spawn physics object in EV
function mc_ev_worldsync.on_block_placed(msg)
    local block_id = msg.block_id
    local x, y, z = msg.x, msg.y, msg.z
    local dimension = msg.dimension
    
    local block_data = mc_ev_worldsync.block_registry[block_id]
    if not block_data then
        print("[MC-EV] Unknown block: " .. block_id)
        return
    end
    
    -- Convert Minecraft coords to UE coords (1 block = 100 UE units, Y-up)
    local ue_x = x * 100
    local ue_y = z * 100  -- Minecraft Z -> UE Y
    local ue_z = y * 100  -- Minecraft Y -> UE Z
    
    mc_ev_worldsync.spawn_physics_block(block_id, block_data, ue_x, ue_y, ue_z, msg.player_uuid)
end

-- Block broken in Minecraft -> destroy physics object in EV
function mc_ev_worldsync.on_block_broken(msg)
    local block_id = msg.block_id
    local x, y, z = msg.x, msg.y, msg.z
    
    -- Find and destroy the corresponding physics object
    local ue_x = x * 100
    local ue_y = z * 100
    local ue_z = y * 100
    
    mc_ev_worldsync.destroy_physics_block_at(ue_x, ue_y, ue_z, block_id)
end

-- Spawn a physics block in Endorphin Vice
function mc_ev_worldsync.spawn_physics_block(block_id, block_data, x, y, z, player_uuid)
    -- This would use UE4SS to spawn an actor with a static mesh component
    -- Simplified pseudocode:
    --
    -- local world = GetWorld()
    -- local actor = world:SpawnActor(AActor, FVector(x, y, z), FRotator(0, 0, 0))
    -- local mesh_comp = actor:CreateDefaultSubobject(UStaticMeshComponent, "BlockMesh")
    -- mesh_comp:SetStaticMesh(LoadObject(block_data.mesh_path))
    -- mesh_comp:SetMaterial(0, LoadObject(block_data.material_path))
    -- 
    -- if block_data.physics_type == "dynamic" then
    --     mesh_comp:SetSimulatePhysics(true)
    --     mesh_comp:SetMassOverrideInKg(NAME_None, block_data.mass_kg, true)
    -- elseif block_data.physics_type == "explosive" then
    --     mesh_comp:SetSimulatePhysics(true)
    --     mesh_comp:SetMassOverrideInKg(NAME_None, block_data.mass_kg, true)
    --     -- Add explosion component
    -- end
    --
    -- local actor_id = mc_ev_worldsync.state.next_actor_id
    -- mc_ev_worldsync.state.next_actor_id = mc_ev_worldsync.state.next_actor_id + 1
    -- mc_ev_worldsync.state.physics_objects[actor_id] = {
    --     actor = actor,
    --     block_id = block_id,
    --     mesh_comp = mesh_comp
    -- }
    --
    -- -- Notify Minecraft
    -- mc_ev_worldsync.send_to_mc({
    --     type = "physics_object_spawned",
    --     ev_actor_id = actor_id,
    --     block_id = block_id,
    --     x = x / 100, y = y / 100, z = z / 100,
    --     rotation = {pitch = 0, yaw = 0, roll = 0}
    -- })
    
    print(string.format("[MC-EV] Would spawn %s at %.0f %.0f %.0f", block_id, x, y, z))
end

-- Destroy physics block at location
function mc_ev_worldsync.destroy_physics_block_at(x, y, z, block_id)
    -- Find closest physics object of this block type
    local best_actor_id = nil
    local best_dist = math.huge
    
    for actor_id, obj in pairs(mc_ev_worldsync.state.physics_objects) do
        if obj.block_id == block_id then
            local loc = obj.actor:K2_GetActorLocation()
            local dist = math.sqrt((loc.X - x)^2 + (loc.Y - y)^2 + (loc.Z - z)^2)
            if dist < best_dist and dist < 100 then -- Within 1 block
                best_dist = dist
                best_actor_id = actor_id
            end
        end
    end
    
    if best_actor_id then
        local obj = mc_ev_worldsync.state.physics_objects[best_actor_id]
        local loc = obj.actor:K2_GetActorLocation()
        
        -- Notify Minecraft before destroying
        mc_ev_worldsync.send_to_mc({
            type = "physics_object_destroyed",
            ev_actor_id = best_actor_id,
            block_id = block_id,
            x = loc.X / 100,
            y = loc.Y / 100,
            z = loc.Z / 100,
            cause = "block_broken"
        })
        
        obj.actor:Destroy()
        mc_ev_worldsync.state.physics_objects[best_actor_id] = nil
        print(string.format("[MC-EV] Destroyed %s actor %d", block_id, best_actor_id))
    end
end

-- Handle sync request from Minecraft
function mc_ev_worldsync.on_sync_request(msg)
    local request_id = msg.request_id
    local region = msg.region
    
    -- Find all physics objects in region
    local objects = {}
    
    for actor_id, obj in pairs(mc_ev_worldsync.state.physics_objects) do
        local loc = obj.actor:K2_GetActorLocation()
        local mc_x = loc.X / 100
        local mc_y = loc.Z / 100
        local mc_z = loc.Y / 100
        
        if mc_x >= region.min_x and mc_x <= region.max_x and
           mc_y >= region.min_y and mc_y <= region.max_y and
           mc_z >= region.min_z and mc_z <= region.max_z then
            table.insert(objects, {
                block_id = obj.block_id,
                x = mc_x,
                y = mc_y,
                z = mc_z,
                ev_actor_id = actor_id
            })
        end
    end
    
    mc_ev_worldsync.send_to_mc({
        type = "sync_response",
        request_id = request_id,
        objects = objects
    })
end

-- Heartbeat
function mc_ev_worldsync.send_heartbeat()
    if mc_ev_worldsync.state.connected then
        mc_ev_worldsync.send_to_mc({
            type = "heartbeat",
            timestamp = os.time() * 1000,
            sender = "endorphin_vice"
        })
    end
end

-- Initialize
function mc_ev_worldsync.init()
    print("[MC-EV] Initializing Minecraft x Endorphin Vice World Sync")
    
    -- Create pipe server
    local pipe_path = create_pipe_server(mc_ev_worldsync.config.pipe_name)
    print("[MC-EV] Pipe path: " .. pipe_path)
    
    -- In actual UE4SS implementation:
    -- 1. Use FFI to create named pipe
    -- 2. Start async read loop
    -- 3. Register OnActorDestroyed hook for cleanup
    -- 4. Register key bindings for debug
    
    mc_ev_worldsync.state.connected = true -- Placeholder
    
    -- Start heartbeat
    mc_ev_worldsync.state.heartbeat_timer = LoopTimer:New()
    mc_ev_worldsync.state.heartbeat_timer:SetInterval(mc_ev_worldsync.config.heartbeat_interval)
    mc_ev_worldsync.state.heartbeat_timer:SetFunction(mc_ev_worldsync.send_heartbeat)
    mc_ev_worldsync.state.heartbeat_timer:Start()
    
    print("[MC-EV] Initialized (placeholder - needs UE4SS FFI implementation)")
end

-- Cleanup
function mc_ev_worldsync.shutdown()
    if mc_ev_worldsync.state.heartbeat_timer then
        mc_ev_worldsync.state.heartbeat_timer:Stop()
    end
    
    if mc_ev_worldsync.state.pipe_handle then
        -- CloseHandle(pipe_handle)
        mc_ev_worldsync.state.pipe_handle = nil
    end
    
    mc_ev_worldsync.state.connected = false
    print("[MC-EV] Shutdown")
end

-- Debug commands (register to UE4SS console)
RegisterKeyBind(Key.F9, function()
    print("[MC-EV] Physics objects: " .. table_size(mc_ev_worldsync.state.physics_objects))
    for id, obj in pairs(mc_ev_worldsync.state.physics_objects) do
        local loc = obj.actor:K2_GetActorLocation()
        print(string.format("  %d: %s at %.0f %.0f %.0f", id, obj.block_id, loc.X, loc.Y, loc.Z))
    end
end)

-- Utility
function table_size(t)
    local count = 0
    for _ in pairs(t) do count = count + 1 end
    return count
end

-- Auto-initialize when level loads
RegisterHook("/Script/Engine.GameViewportClient:OnGameViewportCreated", function()
    mc_ev_worldsync.init()
end)

return mc_ev_worldsync