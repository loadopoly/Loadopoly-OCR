export const announce = (message: string, type: 'polite' | 'assertive' = 'polite') => {
  const region = document.getElementById(type === 'assertive' ? 'alert-region' : 'status-region');
  if (region) {
    region.textContent = message;
    // Clear it after a delay so it can be announced again if needed
    setTimeout(() => {
      if (region.textContent === message) {
        region.textContent = '';
      }
    }, 3000);
  }
};