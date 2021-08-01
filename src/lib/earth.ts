import * as THREE from 'three'
import initEarth, { createControls, createStarField, initGui } from '../lib/initEarth'
import { endPositions, Position, startPositions } from '../data/position'

export interface Earth extends THREE.Group {
  scaleA: number
  start_data: Position[]
  scaleB: number
  end_data: Position[]
  age_data: boolean
  show: boolean
  timeline: string
  spinrate: number
  autoanimate: boolean
  animate: number
  autoanimaterate: number
  animate_dir: number
  spin: boolean
  link: string
  plate_selected?: string
}

const toTitleCase = (str: string) =>
  str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())

async function main() {
  const landObj = startPositions.map(({ name, x, y, z, id }) => ({
    name: toTitleCase(name.replace(/_/g, ' ')).replace('Sw', 'SW').replace('Se', 'SE'),
    filename: `masks/${name}.png`,
    key: name,
    rotationx: 3,
    rotationy: 0,
    repeatx: 1,
    repeaty: 1,
    offsetx: 0,
    offsety: 0,
    visible: true,
    x,
    y,
    z,
    id,
  }))
  const scale_min = 0.5
  landObj.sort((a, b) => a.id - b.id)

  //Setup:

  const WIDTH = window.innerWidth
  const HEIGHT = window.innerHeight
  const CENTER = new THREE.Vector3(0, 0, 0)

  const container = document.querySelector('#container')!

  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(WIDTH, HEIGHT)

  //Adding a Camera

  //set camera attributes
  const VIEW_ANGLE = 45
  const ASPECT = WIDTH / HEIGHT
  const NEAR = 0.1
  const FAR = 10000

  //create a camera
  const camera = new THREE.PerspectiveCamera(VIEW_ANGLE, ASPECT, NEAR, FAR)
  camera.position.set(400, 20, 800)
  camera.lookAt(CENTER)

  // Create a scene
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)

  // Attach the renderer to the DOM element.
  container.appendChild(renderer.domElement)

  //Three.js uses geometric meshes to create primitive 3D shapes like spheres, cubes, etc. I’ll be using a sphere.
  const RADIUS = 200
  const SEGMENTS = 50
  const RINGS = 50

  //Create a group (which will later include our sphere and its texture meshed together)

  const earth = initEarth(startPositions, endPositions, scale_min)

  scene.add(earth)

  const ageMap = new THREE.TextureLoader().load('textures/agemap.png')

  const debugPlaneBackground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 200),
    new THREE.MeshBasicMaterial({ color: 0x0000dd, side: THREE.DoubleSide }),
  )
  debugPlaneBackground.position.z = 399
  const debugPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 200),
    new THREE.MeshBasicMaterial({ color: 0x0000dd, side: THREE.DoubleSide }),
  )
  debugPlane.position.z = 400

  const plates = landObj.map((obj) => {
    const land = new THREE.Group()
    land.name = obj.key

    new THREE.TextureLoader().load(obj.filename, (texture) => {
      const sphere = new THREE.SphereGeometry(RADIUS, SEGMENTS, RINGS)
      texture.repeat.set(1, 1)
      texture.wrapS = THREE.RepeatWrapping
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        alphaTest: 1,
        alphaMap: ageMap,
        side: THREE.DoubleSide,
      })

      const mesh = new THREE.Mesh(sphere, material)
      // mesh.name = obj.key
      land.add(mesh)

      if (obj.key === 'north_america2') {
        debugPlane.material = material
      }
    })
    return land
  })

  earth.add(...plates)

  const starField = createStarField()

  scene.add(starField)
  scene.add(camera)

  scene.add(debugPlaneBackground)
  scene.add(debugPlane)

  const controls = createControls(camera, renderer.domElement)

  //set update function to transform the scene and view
  function update() {
    if (earth.spin) {
      earth.rotation.y += earth.spinrate
    }
    if (earth.autoanimate) {
      earth.animate += earth.autoanimaterate * earth.animate_dir
      if (earth.animate > 100) {
        earth.animate_dir = -1
        earth.animate = 100
      }
      if (earth.animate < 1) {
        earth.animate_dir = 1
        earth.animate = 1
      }
      animate()
      controls.autoRotate = true
    } else {
      controls.autoRotate = false
    }

    //render
    renderer.render(scene, camera)

    //schedule the next frame.
    requestAnimationFrame(update)
  }

  //schedule the first frame.
  requestAnimationFrame(update)

  function scaleEarthMain(amt: number) {
    const offset = -0.6 * amt + 0.6
    const repeat = 1.2 * amt - 0.2

    earth.scale.x = amt
    earth.scale.y = amt
    earth.scale.z = amt

    plates
      .filter((c) => c.children[0])
      .forEach((c) => {
        const material = (c.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial
        const texture = material.map
        material.alphaTest = Math.max(0, 1 - (amt - 0.5) * 2)

        texture?.offset.set(offset, offset)
        texture?.repeat.set(repeat, repeat)
      })
  }

  const gui = initGui(earth, landObj, { animate, updatePositions, updateUvTransform })

  function updatePositions() {
    if (earth.timeline === 'A') {
      scaleEarthMain(earth.scaleA)
    } else {
      scaleEarthMain(earth.scaleB)
    }

    const positions = earth.timeline === 'A' ? startPositions : endPositions

    positions.forEach(({ id, x, y, z }) => {
      landObj[id].x = x
      landObj[id].y = y
      landObj[id].z = z

      plates[id].rotation.x = x
      plates[id].rotation.y = y
      plates[id].rotation.z = z
    })

    if (gui) {
      for (let i = 0; i < Object.keys(gui.__folders).length; i++) {
        const key = Object.keys(gui.__folders)[i]
        for (let j = 0; j < gui.__folders[key].__controllers.length; j++) {
          gui.__folders[key].__controllers[j].updateDisplay()
        }
      }
    }
  }
  updatePositions()

  function updateUvTransform() {
    earth.spin = false
    const data = landObj.map(({ id, name, x, y, z }) => ({ id, name, x, y, z }))

    landObj.forEach((l, i) => {
      plates[i].rotation.x = l.x
      plates[i].rotation.y = l.y
      plates[i].rotation.z = l.z
      plates[i].visible = l.visible
    })

    if (earth.timeline === 'A') {
      if (earth.animate > 1) earth.animate = 1
      scaleEarthMain(earth.scaleA)
      earth.start_data = data
    } else {
      if (earth.animate < 100) earth.animate = 100
      scaleEarthMain(earth.scaleB)
      earth.end_data = data
    }
  }
  updateUvTransform()

  function animate() {
    const time_ratio = earth.animate / 100
    const scale_temp = earth.scaleA + (earth.scaleB - earth.scaleA) * time_ratio
    scaleEarthMain(scale_temp)

    for (let i = 0; i < landObj.length; i++) {
      const coord1 = earth.start_data[i]
      const coord2 = earth.end_data[i]
      plates[i].rotation.x = coord1.x + (coord2.x - coord1.x) * time_ratio
      plates[i].rotation.y = coord1.y + (coord2.y - coord1.y) * time_ratio
      plates[i].rotation.z = coord1.z + (coord2.z - coord1.z) * time_ratio
    }
  }

  console.log(earth)

  window.addEventListener('resize', onWindowResize, false)

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()

    renderer.setSize(window.innerWidth, window.innerHeight)
  }

  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      earth.animate += e.deltaY / 50
    },
    false,
  )
}

export default main
