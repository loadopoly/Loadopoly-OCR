export const announce = (message: string, type: 'polite' | 'assertive' = 'polite') => {
  const region = document.getElementById(type === 'assertive' ? 'alert-region' : 'status-region');
  if (region) {
    region.textContent = message;
    setTimeout(() => {
      if (region.textContent === message) {
        region.textContent = '';
      }
    }, 3000);
  }
};