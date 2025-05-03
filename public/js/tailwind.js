tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: '#4361ee',
        'primary-dark': '#3a56d4',
        secondary: '#3f37c9',
        success: '#4cc9f0',
        danger: '#ef476f',
        warning: '#ffd166',
        light: '#f8f9fa',
        dark: '#212529',
        gray: '#6c757d',
        'gray-light': '#e9ecef',
        'body-bg': '#f5f7ff',
        'card-bg': '#ffffff',
      },
      borderRadius: {
        'custom': '12px',
      },
      boxShadow: {
        'custom': '0 8px 30px rgba(0, 0, 0, 0.05)',
        'custom-hover': '0 12px 30px rgba(0, 0, 0, 0.08)',
      },
      transitionProperty: {
        'all': 'all',
      },
      transitionDuration: {
        '300': '300ms',
      },
      transitionTimingFunction: {
        'ease': 'ease',
      },
    }
  }
}