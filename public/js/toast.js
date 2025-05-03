window.toast = {
  success: function (msg) {
    Toastify({
      text: msg,
      duration: 3000,
      gravity: "bottom",
      position: "right",
      backgroundColor: "#22c55e",
      stopOnFocus: true,
      close: true,
    }).showToast();
  },
  error: function (msg) {
    Toastify({
      text: msg,
      duration: 4000,
      gravity: "bottom",
      position: "right",
      backgroundColor: "#ef4444",
      stopOnFocus: true,
      close: true,
    }).showToast();
  },
  info: function (msg) {
    Toastify({
      text: msg,
      duration: 3000,
      gravity: "bottom",
      position: "right",
      backgroundColor: "#3b82f6",
      stopOnFocus: true,
      close: true,
    }).showToast();
  }
};