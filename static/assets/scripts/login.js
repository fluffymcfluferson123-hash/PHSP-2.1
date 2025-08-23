document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form")
  const loginError = document.getElementById("login-error")
  const showReset = document.getElementById("show-reset")
  const resetForm = document.getElementById("reset-form")
  const resetError = document.getElementById("reset-error")

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault()
    loginError.textContent = ""
    const username = document.getElementById("login-username").value.trim()
    const password = document.getElementById("login-password").value
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        localStorage.setItem("registered", "true")
        window.location.href = "/as"
      } else {
        const data = await res.json().catch(() => ({}))
        loginError.textContent = data.error || "Invalid credentials"
      }
    } catch (err) {
      loginError.textContent = "Network error"
    }
  })

  showReset.addEventListener("click", () => {
    resetForm.style.display = "flex"
  })

  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault()
    resetError.textContent = ""
    const username = document.getElementById("reset-username").value.trim()
    const password = document.getElementById("reset-password").value
    if (password.length < 8) {
      resetError.textContent = "Password must be at least 8 characters."
      return
    }
    try {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        resetError.textContent = "Password reset. Please login."
      } else {
        const data = await res.json().catch(() => ({}))
        resetError.textContent = data.error || "Reset failed"
      }
    } catch (err) {
      resetError.textContent = "Network error"
    }
  })
})
