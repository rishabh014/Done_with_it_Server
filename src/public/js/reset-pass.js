const form = document.getElementById('form');
const messageTag = document.getElementById('message');
const password = document.getElementById('password');
const confirmPassword = document.getElementById('confirm-password');
const notification = document.getElementById('notification');
const submitBtn = document.getElementById('submit');


const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

form.style.display = 'none';

let token, id;

window.addEventListener('DOMContentLoaded', async () => {
    const params = new Proxy(new URLSearchParams(window.location.search), {
        get: (searchParams, prop) => searchParams.get(prop),
    });
    token = params.token;
    id = params.id;

    console.log('Token:', token);
    console.log('ID:', id);

    const res = await fetch('/auth/verify-pass-reset-token', {
        method: 'POST',
        body: JSON.stringify({ token, id }),
        headers: {
            "Content-Type": "application/json;charset=utf-8",
        },
    });

    console.log('Verify Response:', res);

    if (!res.ok) {
        const { message } = await res.json();
        messageTag.innerText = message;
        messageTag.classList.add('error');
        return;
    }

    messageTag.style.display = 'none';
    form.style.display = 'block';
});

const displayNotification = (message, type) => {
    notification.style.display = 'block';
    notification.innerText = message;
    notification.className = type;  // Use className instead of add to reset previous classes
};

const handleSubmit = async (evt) => {
    evt.preventDefault();

    console.log('Password:', password.value);
    console.log('Confirm Password:', confirmPassword.value);

    if (!passwordRegex.test(password.value)) {
        return displayNotification("Invalid password. Use alphanumeric and special chars!", "error");
    }

    if (password.value !== confirmPassword.value) {
        return displayNotification("Passwords do not match", "error");
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "Please wait...";

    const res = await fetch("/auth/reset-pass", {
        method: "POST",
        headers: {
            "Content-Type": "application/json;charset=utf-8",
        },
        body: JSON.stringify({ password: password.value, id, token }),
    });

    submitBtn.disabled = false;
    submitBtn.innerText = "Update Password";

    console.log('Update Response:', res);

    if (!res.ok) {
        const { message } = await res.json();
        return displayNotification(message, 'error');
    }

    messageTag.style.display = "block";
    messageTag.innerText = "Your password has been updated successfully";
    form.style.display = 'none';
};

form.addEventListener('submit', handleSubmit);