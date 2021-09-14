import { css } from '@emotion/react'

const theme = css`
  body {
    color: white;
    background-color: black;
  }
  input,
  select {
    background: hsla(0, 0%, 100%, 0.2);
    border: 1px solid hsla(0, 0%, 100%, 0.25);
    color: hsla(0, 0%, 100%, 0.9);
    border-radius: 2px;
    height: 24px;
    font-size: 16px;
  }
  button {
    text-transform: uppercase;
  }
  a,
  button {
    font-size: 1rem;
    background: hsla(0, 0%, 100%, 0.25);
    border: 1px solid hsla(0, 0%, 100%, 0.2);
    color: hsla(0, 0%, 100%, 0.9);
    text-decoration: none;
    :active {
      box-shadow: 0 0 8px 4px hsla(0, 0%, 100%, 0.75);
    }
  }

  code {
    font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace;
    display: inline-block;
    white-space: pre;
  }
  canvas {
    background-color: transparent;
    outline: none;
  }
`

export default theme
