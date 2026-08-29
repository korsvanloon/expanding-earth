# Method


## 1. Create Mesh

Create polygons by clicking to create new points.
Divide the uv map in these polygons.
Add support points within the polygons.
Use Delaunay triangulation on these polygons to generate faces.

### Create Polygon mode
- The first canvas click will start a new polygon with a new point.
- Subsequent canvas clicks add points to the current triangle.
- Press a button (ESC) to deselect the current polygon.
- Drag points to move them.

## 2. Create mesh transformation

Initial mesh is time 0.
Choose a time greater than 0.
Select multiple points with a selection box through dragging.
Create a rotated bounding rectangle.
When the user drags, all selected points move
- a distance in the direction of the short edge of the rectangle,
- shrink in the direction of the long angle with the most outer point as anchor.

# Ages

Cenozoic ~ 0 - 70
Mesozoic ~ 70 - 250
Paleozoic ~ 250 - 550
Late Proterozoic ~ 550 - 1000
Middle Proterozoic ~ 1000 - 1600
Early Proterozoic ~ 1600 - 2500
Archean ~ 2500 - 4000

# Links

- [OpenGL standard functions](https://www.khronos.org/registry/OpenGL-Refpages/gl4/index.php)
- [Calculate distance, bearing and more between Latitude/Longitude points](http://www.movable-type.co.uk/scripts/latlong.html)
- [Built-in uniforms and attributes for Shaders](https://threejs.org/docs/#api/en/renderers/webgl/WebGLProgram)
- [Thickness of the Earth's crust](https://www.geolsoc.org.uk/Geoscientist/Archive/August-2018/Roberts-Crust)
- [Cube Sphere with more equal squares](https://github.com/Imarion/CubeSphere/blob/master/Assets/Scripts/CubeSphere.cs)
- [Mesh editing in THREE.js](https://discourse.threejs.org/t/mesh-editing-vertices-and-faces/15563)

# Editor