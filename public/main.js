window.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  document.getElementById("date").value = today.toISOString().slice(0, 10);
  document.getElementById("week").value = getWeekNumber(today);
  document.getElementById("month").value = today.getMonth() + 1;
  document.getElementById("year").value = today.getFullYear();
});

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

document.getElementById("expenseForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = {
    name: document.getElementById("name").value,
    amount: parseFloat(document.getElementById("amount").value),
    category: document.getElementById("category").value,
    date: document.getElementById("date").value,
    week: parseInt(document.getElementById("week").value),
    month: parseInt(document.getElementById("month").value),
    year: parseInt(document.getElementById("year").value),
  };

  const res = await fetch("/api/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData),
  });

  if (res.ok) {
    alert("Expense added successfully!");
    document.getElementById("expenseForm").reset();
    location.reload();
  } else {
    alert("Failed to add expense.");
  }
});

async function loadTables() {
  await fetchAndDisplay("/api/expenses/daily", "dailyTable");
  await fetchAndDisplay("/api/expenses/weekly", "weeklyTable");
  await fetchAndDisplay("/api/expenses/monthly", "monthlyTable");
}

async function fetchAndDisplay(apiRoute, tableId) {
  const res = await fetch(apiRoute);
  const data = await res.json();

  const table = document.getElementById(tableId);
  table.innerHTML = `
    <tr>
      <th>Name</th>
      <th>₹</th>
      <th>Category</th>
      <th>Date</th>
    </tr>
  `;

  data.forEach(exp => {
    table.innerHTML += `
      <tr>
        <td>${exp.name}</td>
        <td>₹${exp.amount}</td>
        <td>${exp.category}</td>
        <td>${new Date(exp.date).toLocaleDateString()}</td>
      </tr>
    `;
  });
}

loadTables(); // Call when page loads

