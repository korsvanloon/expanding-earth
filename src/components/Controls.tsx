
const Controls = () => {
  return (
    <div className="dg ac">
      <div className="dg main a" style={{ width: '350px' }}>
        <div
          style={{
            width: '6px',
            marginLeft: '-3px',
            height: '1064px',
            cursor: 'ew-resize',
            position: 'absolute',
          }}
        >
          <ul style={{ width: 'auto' }}>
            <li className="cr string">
              <div>
                <span className="property-name">Position</span>
                <div className="c">
                  <select>
                    <option value="A">A</option>
                    <option value="B">B</option>
                  </select>
                </div>
              </div>
            </li>
            <li className="cr number has-slider">
              <div>
                <span className="property-name">A) Scale</span>
                <div className="c">
                  <div>
                    <input type="text" />
                  </div>
                  <div className="slider">
                    <div className="slider-fg" style={{ width: '100%' }} />
                  </div>
                </div>
              </div>
            </li>
            <li className="cr number has-slider">
              <div>
                <span className="property-name">B) Scale</span>
                <div className="c">
                  <div>
                    <input type="text" />
                  </div>
                  <div className="slider">
                    <div className="slider-fg" />
                  </div>
                </div>
              </div>
            </li>
            <li className="cr number has-slider">
              <div>
                <span className="property-name">Animate</span>
                <div className="c">
                  <div>
                    <input type="text" />
                  </div>
                  <div className="slider">
                    <div className="slider-fg" style={{ width: '75.7212%' }} />
                  </div>
                </div>
              </div>
            </li>
            <li className="cr boolean">
              <div>
                <span className="property-name">Spin</span>
                <div className="c">
                  <input type="checkbox" checked />
                </div>
              </div>
            </li>
            <li className="cr boolean">
              <div>
                <span className="property-name">Auto-animate</span>
                <div className="c">
                  <input type="checkbox" checked />
                </div>
              </div>
            </li>
            <li className="cr number">
              <div>
                <span className="property-name">Spin Rate</span>
                <div className="c">
                  <input type="text" />
                </div>
              </div>
            </li>
            <li className="cr number">
              <div>
                <span className="property-name">Auto-animate Rate</span>
                <div className="c">
                  <input type="text" />
                </div>
              </div>
            </li>
            <li className="cr string">
              <div>
                <span className="property-name">Link</span>
                <div className="c">
                  <input type="text" />
                </div>
              </div>
            </li>
            <li className="cr boolean">
              <div>
                <span className="property-name">Show Starfield</span>
                <div className="c">
                  <input type="checkbox" />
                </div>
              </div>
            </li>
            <li className="cr boolean">
              <div>
                <span className="property-name">Seafloor Age Data</span>
                <div className="c">
                  <input type="checkbox" />
                </div>
              </div>
            </li>
            <li className="cr boolean">
              <div>
                <span className="property-name">Show Grid</span>
                <div className="c">
                  <input type="checkbox" />
                </div>
              </div>
            </li>
            <li className="cr color" style={{ width: 'rgb(23, 113, 226)' }}>
              <div>
                <span className="property-name">Earth Color</span>
                <div className="c">
                  <input
                    type="text"
                    style={{
                      width: 'none',
                      textAlign: 'center',
                      color: 'rgb(255, 255, 255)',
                      border: '0px',
                      fontWeight: 'bold',
                      textShadow: 'rgba(0, 0, 0.7) 0px 1px 1px',
                      backgroundColor: 'rgb(23, 113, 226)',
                    }}
                  />
                  <div
                    className="field-knob"
                    style={{
                      position: 'absolute',
                      width: '12px',
                      height: '12px',
                      border: '2px solid rgb(255, 255, 255)',
                      boxShadow: 'rgba(0, 0, 0.5) 0px 1px 3px',
                      borderRadius: '2px',
                      zIndex: 1,
                      marginLeft: '82.823px',
                      marginTop: '4.37255px',
                      backgroundColor: 'rgb(23, 113, 226)',
                    }}
                  >
                    <div
                      className="saturation-field"
                      style={{
                        width: '100px',
                        height: '100px',
                        border: '1px solid rgb(85, 85, 85)',
                        marginRight: '3px',
                        display: 'inline-block',
                        cursor: 'pointer',
                        background:
                          '-webkit-linear-gradient( left, rgb(255, 255, 255) 0%, rgb(0, 113, 100% )',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          background:
                            '-webkit-linear-gradient( top, rgba(0, 0, 0) 0%, rgb(0, 100% )',
                        }}
                      ></div>
                      <div
                        className="hue-field"
                        style={{
                          width: '15px',
                          height: '100px',
                          border: '1px solid rgb(85, 85, 85)',
                          cursor: 'ns-resize',
                          position: 'absolute',
                          top: '3px',
                          right: 0,
                          background:
                            '-webkit-linear-gradient( top, rgb(255, 0, 0) 0%, 255) 17%, rgb(0, 34%, 255, 50%, 67%, 84%, 100% )',
                        }}
                      >
                        <div
                          className="hue-knob"
                          style={{
                            position: 'absolute',
                            width: '15px',
                            height: '2px',
                            borderRight: '4px solid rgb(255, 255, 255)',
                            zIndex: 1,
                            marginTop: '40.7225px',
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </li>
            <li className="cr color" style={{ width: 'rgb(0, 0, 0)' }}>
              <div>
                <span className="property-name">Background</span>
                <div className="c">
                  <input
                    type="text"
                    style={{
                      width: 'none',
                      textAlign: 'center',
                      color: 'rgb(255, 255, 255)',
                      border: '0px',
                      fontWeight: 'bold',
                      textShadow: 'rgba(0, 0, 0.7) 0px 1px 1px',
                      backgroundColor: 'rgb(0, 0)',
                    }}
                  />
                  <div
                    className="selector"
                    style={{
                      width: '122px',
                      height: '102px',
                      padding: '3px',
                      backgroundColor: 'rgb(34, 34, 34)',
                      boxShadow: 'rgba(0, 0, 0.3) 0px 1px 3px',
                    }}
                  >
                    <div
                      className="field-knob"
                      style={{
                        position: 'absolute',
                        width: '12px',
                        height: '12px',
                        border: '2px solid rgb(255, 255, 255)',
                        boxShadow: 'rgba(0, 0, 0.5) 0px 1px 3px',
                        borderRadius: '2px',
                        zIndex: 1,
                        marginLeft: '-7px',
                        marginTop: '93px',
                        backgroundColor: 'rgb(0, 0)',
                      }}
                    >
                      <div
                        className="saturation-field"
                        style={{
                          width: '100px',
                          height: '100px',
                          border: '1px solid rgb(85, 85, 85)',
                          marginRight: '3px',
                          display: 'inline-block',
                          cursor: 'pointer',
                          background:
                            '-webkit-linear-gradient( left, rgb(255, 255, 255) 0%, 0, 0) 100% )',
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            background:
                              '-webkit-linear-gradient( top, rgba(0, 0, 0) 0%, rgb(0, 100% )',
                          }}
                        ></div>
                        <div
                          className="hue-field"
                          style={{
                            width: '15px',
                            height: '100px',
                            border: '1px solid rgb(85, 85, 85)',
                            cursor: 'ns-resize',
                            position: 'absolute',
                            top: '3px',
                            right: 0,
                            background:
                              '-webkit-linear-gradient( top, rgb(255, 0, 0) 0%, 255) 17%, rgb(0, 34%, 255, 50%, 67%, 84%, 100% )',
                          }}
                        >
                          <div
                            className="hue-knob"
                            style={{
                              position: 'absolute',
                              width: '15px',
                              height: '2px',
                              borderRight: '4px solid rgb(255, 255, 255)',
                              zIndex: 1,
                              marginTop: '100px',
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">Africa</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '50.21%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '53.32%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '50.98%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul>
                  <li className="title">Antarctica</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '18.58%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '59.62%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '66.33%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">Arabian Peninsula</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '19.1%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '74.2%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '24.11%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">Asia Kamchatka</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '50.21%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '75.54%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '60.8%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">Asia Russia</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '49.73%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '68.35%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '61.65%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">Asia SE</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '49.44%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '65.8%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '54.82%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">Asia SW</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '49.34%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '59.3%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '55.18%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">Australia</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '49.73%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '72.47%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '45.9%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">Borneo</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '51.22%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '69.63%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '48.35%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">Europe</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '50%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '52.5%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '58.2%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">Greenland</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '49.73%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '39%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '61.65%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">India</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '52.71%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '63.14%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '51.22%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">Indonesia</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '50.7%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '68.63%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '48.7%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">Japan</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '50.98%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '72.47%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '56.35%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">Madegascar</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '48.24%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '57.92%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '47.49%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">New Guinea</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '49.73%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '74.5%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '48.35%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">New Zealand</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '51.22%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '80.92%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '41.9%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">North America</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '48.94%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '32.1%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '56.59%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">North America Alaska</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '50%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '22.57%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '61.65%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
            <li className="folder">
              <div className="dg">
                <ul className="closed">
                  <li className="title">South America</li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">x</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '50.5%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">y</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '38.3%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr number has-slider">
                    <div>
                      <span className="property-name">z</span>
                      <div className="c">
                        <div>
                          <input type="text" />
                        </div>
                        <div className="slider">
                          <div className="slider-fg" style={{ width: '47.1%' }} />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="cr boolean">
                    <div>
                      <span className="property-name">Visibility</span>
                      <div className="c">
                        <input type="checkbox" defaultChecked />
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
          </ul>
          <div className="close-button close-bottom" style={{ width: '350px' }}>
            Close Controls
          </div>
        </div>
      </div>
    </div>
  )
}

export default Controls
