/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        retro: {
          bg: {
            light: '#F4EFEA', // Cream/warm paper
            dark: '#1C1917',  // Very dark warm gray (Stone 900)
          },
          panel: {
            light: '#EAE0D5', // Muted tan/sand
            dark: '#292524',  // Stone 800
          },
          text: {
            light: '#3C2F2F', // Deep warm brown
            dark: '#E7E5E4',  // Stone 200
          },
          border: {
            light: '#D0C0B0', // Muted border
            dark: '#44403C',  // Stone 700
          },
          orange: '#CB4B16', // Retro orange
          blue: '#268BD2',   // Turquoise / bright blue
          green: '#859900',  // Olive green
          yellow: '#B58900', // Ochre yellow
          red: '#DC322F',    // Muted red
        }
      }
    },
  },
  plugins: [],
}
