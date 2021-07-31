import  { useState } from 'react'

const Instructions = () => {

  const [open, setOpen] = useState(true)
  return (
    <div id="instructions">
      <div id="window_1">
        <h2>Tectonic Tessellation Playground</h2>
        <p>
          <strong>Instructions:</strong>
        </p>
        <ol>
          <li>
            Set one of the two positions (A or B) to adjust. These points are the beginning and end
            position for the animation. Each land mass can be adjusted by modifying their x, y, and
            z axis rotation (this can be tedious). You may drag the earth to see different views.
          </li>
          <li>Adjust the Scale for positions A and B (in percent).</li>
          <li>
            Use the animate slider-bar to view the model as it transitions from position A to B.
          </li>

          <li>
            <a href="https://www.youtube.com/watch?v=qlW1Gjambh8&amp;t=3s">Instructional video</a>
          </li>
        </ol>
        <p>The current settings are saved in the link URL. Copy and paste to share.</p>
        <p>
          <strong>Examples:</strong>
        </p>
        <ol>
          <li>
            <a href="https://www.interactive-earth.com/earth/plate-tectonics.html?scaleA=1.00&amp;scaleB=1.00&amp;start_data=0,-0.491,0.004,-0.137|1,0.004,-1.412,1.138|2,-2.589,0.700,0.712|3,-3.142,2.767,-3.042|4,0.647,1.289,0.288|5,0.288,2.272,1.492|6,0.440,1.980,0.642|7,1.096,2.170,-2.282|8,0.784,0.713,0.430|9,0.217,-0.208,0.784|10,-0.593,0.328,-0.286|11,-0.562,-0.987,0.146|12,0.359,-0.775,-0.066|13,1.019,1.940,-2.052|14,0.075,2.484,0.571|15,0.855,2.272,0.784|16,0.405,2.785,1.480|17,0.405,2.170,-1.898|18,0.217,2.413,0.430|19,-1.361,0.580,0.098|&amp;end_data=0,0.021,0.332,0.098|1,0.000,-2.743,1.165|2,-3.142,0.962,1.633|3,-3.090,2.420,-2.589|4,-0.066,0.930,0.518|5,-0.027,1.835,1.165|6,-0.056,1.580,0.482|7,-0.027,2.247,-0.410|8,0.000,0.250,0.820|9,-0.027,-1.100,1.165|10,-0.176,0.792,-0.251|11,-0.106,-1.790,0.659|12,0.050,-1.170,-0.290|13,-0.027,2.450,-0.165|14,0.122,1.963,-0.165|15,0.098,2.247,0.635|16,0.021,2.554,1.080|17,0.122,3.092,-0.810|18,0.070,1.863,-0.130|19,0.271,1.314,0.122|">
              Pangea Model
            </a>
          </li>
          <li>
            <a href="https://www.interactive-earth.com/earth/plate-tectonics.html?scaleA=0.50&amp;scaleB=1.00&amp;start_data=0,0.092,-0.175,-0.375|1,-0.042,-3.174,1.224|2,-2.819,0.226,1.633|3,-2.907,2.824,-2.840|4,-0.421,0.292,0.217|5,0.292,2.024,0.758|6,-0.474,1.491,0.420|7,0.623,3.323,-0.251|8,-0.208,-0.208,0.713|9,0.217,-0.975,1.224|10,0.251,0.251,-0.747|11,0.025,-1.974,0.625|12,-0.886,-1.442,-1.919|13,0.305,3.641,-0.092|14,-0.108,1.891,-0.175|15,0.292,2.491,0.225|16,-0.133,2.938,1.096|17,-0.092,3.900,-1.204|18,1.624,2.157,-1.641|19,-0.440,0.865,0.098|&amp;end_data=0,0.021,0.332,0.098|1,0.000,-2.743,1.165|2,-3.142,0.962,1.633|3,-3.090,2.420,-2.589|4,-0.066,0.930,0.518|5,-0.027,1.835,1.165|6,-0.056,1.580,0.482|7,-0.027,2.247,-0.410|8,0.000,0.250,0.820|9,-0.027,-1.100,1.165|10,-0.176,0.792,-0.251|11,-0.106,-1.790,0.659|12,0.050,-1.170,-0.290|13,-0.027,2.450,-0.165|14,0.122,1.963,-0.165|15,0.098,2.247,0.635|16,0.021,2.478,1.080|17,0.122,3.092,-0.810|18,0.070,1.863,-0.130|19,0.271,1.314,0.122|">
              Expanding Earth Model
            </a>
          </li>
          <li>
            Use
            <a href="https://www.interactive-earth.com/earth/plate-tectonics.html?scaleA=1&amp;scaleB=1.00&amp;start_data=0,0.021,0.332,0.098|1,0.000,-2.743,1.165|2,-3.142,0.962,1.633|3,-3.090,2.420,-2.589|4,-0.066,0.930,0.518|5,-0.027,1.835,1.165|6,-0.056,1.580,0.482|7,-0.027,2.247,-0.410|8,0.000,0.250,0.820|9,-0.027,-1.100,1.165|10,-0.176,0.792,-0.251|11,-0.106,-1.790,0.659|12,0.050,-1.170,-0.290|13,-0.027,2.450,-0.165|14,0.122,1.963,-0.165|15,0.098,2.247,0.635|16,0.021,2.554,1.080|17,0.122,3.092,-0.810|18,0.070,1.863,-0.130|19,0.271,1.314,0.122|&amp;end_data=0,0.021,0.332,0.098|1,0.000,-2.743,1.165|2,-3.142,0.962,1.633|3,-3.090,2.420,-2.589|4,-0.066,0.930,0.518|5,-0.027,1.835,1.165|6,-0.056,1.580,0.482|7,-0.027,2.247,-0.410|8,0.000,0.250,0.820|9,-0.027,-1.100,1.165|10,-0.176,0.792,-0.251|11,-0.106,-1.790,0.659|12,0.050,-1.170,-0.290|13,-0.027,2.450,-0.165|14,0.122,1.963,-0.165|15,0.098,2.247,0.635|16,0.021,2.554,1.080|17,0.122,3.092,-0.810|18,0.070,1.863,-0.130|19,0.271,1.314,0.122|">
              this model
            </a>
            to start from scratch.
          </li>
        </ol>

        <p>
          <strong>Seafloor Age Maps:</strong>
        </p>
        <ul>
          <li>
            <a href="http://www.tectonics.caltech.edu/images/maps/seafloor_age.pdf" target="_blank">
              Seismological Laboratory
            </a>
          </li>
          <li>
            <a href="https://www.ngdc.noaa.gov/mgg/image/crustalimages.html" target="_blank">
              NOAA
            </a>
          </li>
          <li>
            <a href="https://www.interactive-earth.com/earthquakes" target="_blank">
              Earthquake Visualization
            </a>
          </li>
        </ul>
        <p>
          <strong>Lesson Plan:</strong>
        </p>
        <ul>
          <li>
            <a
              href="https://docs.google.com/document/d/1eI7Yhjvsby7kG4d7kxmAjxUEouQ0vK2lD7OdcNBKprM/edit?usp=sharing"
              target="_blank"
            >
              NGSS Aligned - Plate Tectonics Investigation
            </a>
            <br />
            <a href="https://www.teacherspayteachers.com/Store/Interactive-Earth">
              Support this work through TPT
            </a>
          </li>
        </ul>

        <p style={{ textAlign: 'center' }}>
          <a href="https://www.interactive-earth.com/">www.interactive-earth.com</a>
        </p>
      </div>
      <div id="clasp_1" className="clasp">
        <button onClick={() => setOpen(!open)}>{open ? 'Close' : 'Open'}</button>
      </div>
    </div>
  )
}

export default Instructions
