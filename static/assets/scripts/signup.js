document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signup-form")
  const error = document.getElementById("signup-error")

  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    error.textContent = ""

    if (localStorage.getItem("accountCreated") === "true") {
      error.textContent = "An account has already been created on this device."
      return
    }

    const username = document.getElementById("signup-username").value.trim()
    const password = document.getElementById("signup-password").value

    if (password.length < 8) {
      error.textContent = "Password must be at least 8 characters."
      return
    }

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        localStorage.setItem("registered", "true")
        localStorage.setItem("accountCreated", "true")
        window.location.href = "/as"
      } else {
        const data = await res.json().catch(() => ({}))
        error.textContent = data.error || "Signup failed"
      }
    } catch (err) {
      error.textContent = "Network error"
    }
  })
})
