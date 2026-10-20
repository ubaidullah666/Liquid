import bpy, math, os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=64, radius=1.12)
orb = bpy.context.object
orb.name = 'Liquid — hand-shaped glass'
for face in orb.data.polygons: face.use_smooth = True
orb.shape_key_add(name='Basis')
for phase in range(3):
    key = orb.shape_key_add(name=f'Liquid flow {phase + 1}')
    for i, vertex in enumerate(orb.data.vertices):
        p = vertex.co.copy()
        n = p.normalized()
        theta = math.atan2(n.y, n.x)
        phi = math.acos(max(-1, min(1, n.z)))
        offset = .068 * math.sin(3 * theta + phase * 2.094) * math.sin(phi)**2 + .035 * math.sin(5 * phi + 2 * theta + phase * 2.094)
        key.data[i].co = p + n * offset
    for frame in range(1, 242, 10):
        key.value = .5 + .5 * math.sin((frame - 1) / 240 * math.tau + phase * 2.094)
        key.keyframe_insert(data_path='value', frame=frame)
material = bpy.data.materials.new('Optical liquid glass')
material.use_nodes = True
shader = material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Base Color'].default_value = (.72, .8, .94, 1)
shader.inputs['Roughness'].default_value = .075
shader.inputs['Transmission Weight'].default_value = 1
shader.inputs['IOR'].default_value = 1.46
orb.data.materials.append(material)
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 241
scene.render.fps = 30
scene.world.color = (0, 0, 0)
bpy.ops.object.camera_add(location=(0, -7.5, 1.1))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 0)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = camera
for location, energy, size in [((-3,-2,3),1200,4),((3,0,1),900,3),((0,2,3),1400,3)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light=bpy.context.object; light.data.energy=energy; light.data.shape='DISK'; light.data.size=size
    light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'liquid-orb.blend'))
bpy.ops.object.select_all(action='DESELECT'); orb.select_set(True); bpy.context.view_layer.objects.active=orb
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'assets', 'liquid-orb.glb'), use_selection=True, export_format='GLB', export_animations=True, export_morph=True)
print('BLENDER_ORB_READY')
