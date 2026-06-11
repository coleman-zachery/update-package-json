import { createTheme } from '@mui/material/styles'

export const appTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#7c63ff',
    },
    warning: {
      main: '#ffb020',
    },
    error: {
      main: '#ff6b72',
    },
    background: {
      default: '#16171d',
      paper: '#1b1d25',
    },
    text: {
      primary: '#f2f0f7',
      secondary: '#c5b39c',
    },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    button: {
      fontWeight: 600,
      textTransform: 'none',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#16171d',
          color: '#f2f0f7',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiList: {
      styleOverrides: {
        root: {
          paddingTop: 6,
          paddingBottom: 6,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          minHeight: 36,
          fontSize: '0.82rem',
        },
      },
    },
  },
})
