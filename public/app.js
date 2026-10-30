
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const messageBox = document.getElementById("message");

document.getElementById("year").textContent = new Date().getFullYear();

function showMessage(message, type = "error") {
  messageBox.textContent = message;
  messageBox.className = `message ${type}`;
}

function clearMessage() {
  messageBox.textContent = "";
  messageBox.className = "message";
}

function showLogin() {
  loginForm.hidden = false;
  registerForm.hidden = true;

  loginTab.classList.add("active");
  registerTab.classList.remove("active");

  authTitle.textContent = "Welcome back";
  authSubtitle.textContent = "Log in to continue your seva journey.";
  clearMessage();
}

function showRegister() {
  loginForm.hidden = true;
  registerForm.hidden = false;

  loginTab.classList.remove("active");
  registerTab.classList.add("active");

  authTitle.textContent = "Join our community";
  authSubtitle.textContent = "Create an account and begin making a difference.";
  clearMessage();
}

loginTab.addEventListener("click", showLogin);
registerTab.addEventListener("click", showRegister);

async function sendRequest(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(data)
  });

  const result = await response.json().catch(() => ({
    message: "The server returned an invalid response."
  }));

  if (!response.ok) {
    throw new Error(result.message || "Something went wrong.");
  }

  return result;
}

function setFormBusy(form, busy) {
  const button = form.querySelector('button[type="submit"]');

  if (!button) return;

  button.disabled = busy;
  button.classList.toggle("is-loading", busy);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();
  setFormBusy(loginForm, true);

  const formData = new FormData(loginForm);

  try {
    const result = await sendRequest("/api/login", {
      email: formData.get("email"),
      password: formData.get("password")
    });

    showMessage(result.message, "success");
    window.location.assign("/dashboard.html");
  } catch (error) {
    showMessage(error.message);
  } finally {
    setFormBusy(loginForm, false);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();
  setFormBusy(registerForm, true);

  const formData = new FormData(registerForm);

  try {
    const result = await sendRequest("/api/register", {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      password: formData.get("password"),
      role: formData.get("role")
    });

    showMessage(result.message, "success");
    window.location.assign("/dashboard.html");
  } catch (error) {
    showMessage(error.message);
  } finally {
    setFormBusy(registerForm, false);
  }
});

// If the visitor is already logged in, open their dashboard.
async function checkExistingSession() {
  try {
    const response = await fetch("/api/me", {
      credentials: "same-origin"
    });

    if (response.ok) {
      window.location.replace("/dashboard.html");
    }
  } catch {
    // The visitor can still use the login and registration forms.
  }
}

checkExistingSession();
