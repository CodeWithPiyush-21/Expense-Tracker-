let expenses = [];
let userBudget = 0;
let categories = [];

// Analytics Charts
let monthlyChart = null;
let categoryChart = null;

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    document.getElementById('date').valueAsDate = new Date();
    
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('filterMonth').value = currentMonth;
    
    populateYearFilter();
});

function populateYearFilter() {
    const yearSelect = document.getElementById('filterYear');
    const currentYear = new Date().getFullYear();
    for(let i = currentYear - 5; i <= currentYear + 5; i++) {
        let option = document.createElement('option');
        option.value = i;
        option.innerText = i;
        if(i === currentYear) option.selected = true;
        yearSelect.appendChild(option);
    }
}

async function checkSession() {
    try {
        const res = await fetch('/check_session');
        const data = await res.json();
        
        if (data.logged_in) {
            document.getElementById('welcomeMessage').innerText = `Welcome, ${data.username}!`;
            userBudget = data.budget || 0;
            loadCategories();
            loadExpenses();
        } else {
            window.location.href = '/';
        }
    } catch (err) {
        window.location.href = '/';
    }
}

async function logout() {
    await fetch('/logout', { method: 'POST' });
    window.location.href = '/';
}

// --- Categories ---

async function loadCategories() {
    try {
        const response = await fetch('/get_categories');
        categories = await response.json();
        
        // Add default categories if empty
        if(categories.length === 0) {
            categories = [
                { id: 'd1', name: "Food & Dining", color: "#3b82f6" },
                { id: 'd2', name: "Transportation", color: "#10b981" },
                { id: 'd3', name: "Housing & Utilities", color: "#8b5cf6" },
                { id: 'd4', name: "Salary / Income", color: "#059669" }
            ];
        }
        
        updateCategorySelects();
    } catch(err) { console.error(err); }
}

function updateCategorySelects() {
    const select = document.getElementById('category');
    select.innerHTML = '<option value="">Select Category...</option>';
    
    const isIncome = document.querySelector('input[name="txType"]:checked').value === 'income';
    
    categories.forEach(cat => {
        // Simple logic: if income is selected, maybe filter categories? But user can name them anything.
        // We'll just show all categories.
        let option = document.createElement('option');
        option.value = cat.name;
        option.innerText = cat.name;
        select.appendChild(option);
    });
}

function toggleCategories() {
    // Optionally pre-select Income category if type is income
    const isIncome = document.querySelector('input[name="txType"]:checked').value === 'income';
    const subCheck = document.getElementById('isSubscription');
    
    if (isIncome) {
        subCheck.checked = false;
        subCheck.disabled = true;
    } else {
        subCheck.disabled = false;
    }
}

function openCategoryModal() {
    document.getElementById('categoryModal').classList.remove('hidden');
    renderCategoryManager();
}

function closeCategoryModal() {
    document.getElementById('categoryModal').classList.add('hidden');
    loadCategories(); // refresh main select
}

function renderCategoryManager() {
    const list = document.getElementById('categoryList');
    list.innerHTML = '';
    categories.forEach(cat => {
        if(cat.id.toString().startsWith('d')) return; // hide defaults from deletion here if desired, or let them delete.
        
        let li = document.createElement('li');
        li.style = "display:flex; justify-content:space-between; align-items:center; padding: 10px; background: rgba(255,255,255,0.05); margin-bottom: 5px; border-radius: 5px;";
        li.innerHTML = `
            <div style="display:flex; align-items:center; gap: 10px;">
                <div style="width:15px; height:15px; border-radius:50%; background:${cat.color};"></div>
                <span>${cat.name}</span>
            </div>
            <button onclick="deleteCategory(${cat.id})" style="background:none; border:none; color:var(--danger); cursor:pointer;"><i class='bx bx-trash'></i></button>
        `;
        list.appendChild(li);
    });
}

async function addCategory() {
    const name = document.getElementById('newCategoryName').value;
    const color = document.getElementById('newCategoryColor').value;
    
    if(!name) return alert("Enter category name");
    
    try {
        await fetch('/add_category', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, color })
        });
        document.getElementById('newCategoryName').value = '';
        await loadCategories();
        renderCategoryManager();
    } catch(err) { console.error(err); }
}

async function deleteCategory(id) {
    if(!confirm("Delete this category?")) return;
    try {
        await fetch(`/delete_category/${id}`, {method: 'DELETE'});
        await loadCategories();
        renderCategoryManager();
    } catch(err) { console.error(err); }
}

// --- Data Operations ---

async function loadExpenses() {
    try {
        const response = await fetch('/get');
        expenses = await response.json();
        updateUI();
    } catch (error) {
        console.error('Error fetching expenses:', error);
    }
}

async function addTransaction() {
    const amountInput = document.getElementById("amount").value;
    const category = document.getElementById("category").value;
    const itemName = document.getElementById("itemName").value;
    const dateVal = document.getElementById("date").value;
    const txType = document.querySelector('input[name="txType"]:checked').value;
    const isSubscription = document.getElementById("isSubscription").checked ? 1 : 0;
    const receiptFile = document.getElementById("receipt").files[0];

    if (!amountInput || !category || !dateVal) {
        alert("Please fill in Amount, Category, and Date");
        return;
    }

    const amount = parseFloat(amountInput);
    if (amount <= 0) {
        alert("Amount must be greater than 0");
        return;
    }

    const date = new Date(dateVal);
    const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const yearStr = date.getFullYear().toString();

    // Use FormData for file upload
    const formData = new FormData();
    formData.append('amount', amount);
    formData.append('category', category);
    formData.append('item_name', itemName);
    formData.append('date', dateVal);
    formData.append('month', monthStr);
    formData.append('year', yearStr);
    formData.append('type', txType);
    formData.append('is_subscription', isSubscription);
    if (receiptFile) {
        formData.append('receipt', receiptFile);
    }

    try {
        const res = await fetch('/add', {
            method: 'POST',
            body: formData // Note: no headers set for FormData, browser sets multipart/form-data
        });
        
        const data = await res.json();
        if(data.success) {
            loadExpenses();
            // Reset form
            document.getElementById("amount").value = "";
            document.getElementById("itemName").value = "";
            document.getElementById("category").value = "";
            document.getElementById("receipt").value = "";
            document.getElementById("isSubscription").checked = false;
        } else {
            alert(data.msg);
        }
    } catch (error) {
        console.error('Error adding transaction:', error);
    }
}

async function deleteExpense(id) {
    if(!confirm("Are you sure you want to delete this transaction?")) return;

    try {
        await fetch(`/delete/${id}`, { method: 'DELETE' });
        loadExpenses();
    } catch (error) {
        console.error('Error deleting expense:', error);
    }
}

async function setBudget() {
    let newBudget = prompt("Enter your monthly budget limit (₹)", userBudget || 0);
    if (newBudget === null) return;
    
    newBudget = parseFloat(newBudget);
    if (isNaN(newBudget) || newBudget < 0) return alert("Invalid budget amount.");

    try {
        const res = await fetch('/update_budget', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ budget: newBudget })
        });
        const data = await res.json();
        if(data.success) {
            userBudget = newBudget;
            updateUI();
        }
    } catch(err) {
        console.error(err);
    }
}

// --- UI Updates ---

function handleFilterTypeChange() {
    const type = document.getElementById('filterType').value;
    document.getElementById('filterMonth').style.display = type === 'monthly' ? 'block' : 'none';
    document.getElementById('filterQuarter').style.display = type === 'quarterly' ? 'block' : 'none';
    document.getElementById('filterYear').style.display = (type === 'yearly' || type === 'quarterly') ? 'block' : 'none';
    updateUI();
}

function getFilteredExpenses() {
    const type = document.getElementById('filterType').value;
    const searchQuery = document.getElementById("searchInput").value.toLowerCase();
    
    let filtered = expenses;

    if (type === 'monthly') {
        const filterMonth = document.getElementById("filterMonth").value;
        filtered = filtered.filter(exp => exp.month === filterMonth);
    } else if (type === 'yearly') {
        const filterYear = document.getElementById("filterYear").value;
        filtered = filtered.filter(exp => exp.year === filterYear);
    } else if (type === 'quarterly') {
        const filterYear = document.getElementById("filterYear").value;
        const quarter = document.getElementById("filterQuarter").value;
        
        filtered = filtered.filter(exp => {
            if(exp.year !== filterYear) return false;
            const m = parseInt(exp.month.split('-')[1]);
            if(quarter === 'Q1') return m >= 1 && m <= 3;
            if(quarter === 'Q2') return m >= 4 && m <= 6;
            if(quarter === 'Q3') return m >= 7 && m <= 9;
            if(quarter === 'Q4') return m >= 10 && m <= 12;
            return false;
        });
    }

    if(searchQuery) {
        filtered = filtered.filter(exp => 
            exp.category.toLowerCase().includes(searchQuery) || 
            (exp.item_name && exp.item_name.toLowerCase().includes(searchQuery))
        );
    }

    return filtered.sort((a, b) => new Date(b.date || a.date) - new Date(a.date || b.date));
}

function updateUI() {
    displayExpenses();
    calculateTotals();
    loadAnalytics(); 
}

function displayExpenses() {
    const list = document.getElementById("expenseList");
    const filteredExpenses = getFilteredExpenses();
    
    list.innerHTML = "";

    if (filteredExpenses.length === 0) {
        list.innerHTML = `<div class="empty-state">No transactions found for the selected filter.</div>`;
        return;
    }

    filteredExpenses.forEach(exp => {
        const li = document.createElement("li");
        li.className = "expense-item";
        
        let dateStr = "Unknown Date";
        if (exp.date) {
            const dateObj = new Date(exp.date);
            dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } else if (exp.month) {
            dateStr = exp.month;
        }

        const title = exp.item_name ? `${exp.item_name} <span style="font-size: 0.8rem; color: var(--text-muted);">(${exp.category})</span>` : exp.category;
        
        const isIncome = exp.type === 'income';
        const amountColor = isIncome ? 'var(--success)' : '#f8fafc';
        const sign = isIncome ? '+' : '-';
        
        let receiptHtml = '';
        if (exp.receipt_path) {
            receiptHtml = `<button onclick="viewReceipt('${exp.receipt_path}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-size:1.2rem; margin-right:10px;" title="View Receipt"><i class='bx bx-image'></i></button>`;
        }
        
        let subHtml = '';
        if (exp.is_subscription) {
            subHtml = `<span style="background: rgba(139, 92, 246, 0.2); color: #c4b5fd; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; margin-left: 8px;"><i class='bx bx-sync'></i> Recurring</span>`;
        }

        li.innerHTML = `
            <div class="expense-info">
                <span class="expense-category">${title} ${subHtml}</span>
                <span class="expense-date">${dateStr}</span>
            </div>
            <div class="expense-right">
                ${receiptHtml}
                <span class="expense-amount" style="color: ${amountColor};"> ${sign}₹${parseFloat(exp.amount).toLocaleString('en-IN')}</span>
                <button class="delete-btn" onclick="deleteExpense(${exp.id})" title="Delete" style="margin-left: 10px;">
                    <i class='bx bx-trash'></i>
                </button>
            </div>
        `;
        list.appendChild(li);
    });
}

function calculateTotals() {
    let totalInc = 0;
    let totalExp = 0;
    let totalSub = 0;

    const filteredExpenses = getFilteredExpenses();

    filteredExpenses.forEach(exp => {
        if (exp.type === 'income') {
            totalInc += parseFloat(exp.amount);
        } else {
            totalExp += parseFloat(exp.amount);
            if (exp.is_subscription) {
                totalSub += parseFloat(exp.amount);
            }
        }
    });

    const net = totalInc - totalExp;

    document.getElementById("totalIncome").innerText = `₹${totalInc.toLocaleString('en-IN')}`;
    document.getElementById("totalExpense").innerText = `₹${totalExp.toLocaleString('en-IN')}`;
    document.getElementById("netSavings").innerText = `₹${net.toLocaleString('en-IN')}`;
    document.getElementById("totalSubscriptions").innerText = `₹${totalSub.toLocaleString('en-IN')}`;

    updateBudgetUI(totalExp);
}

function updateBudgetUI(spentInView) {
    const statusEl = document.getElementById("budgetStatus");
    const percentEl = document.getElementById("budgetPercent");
    const progressEl = document.getElementById("budgetProgress");

    if (userBudget <= 0) {
        statusEl.innerText = `₹${spentInView.toLocaleString('en-IN')} / Not Set`;
        percentEl.innerText = "0%";
        progressEl.style.width = "0%";
        progressEl.style.background = 'var(--accent)';
        return;
    }

    const percentage = Math.min((spentInView / userBudget) * 100, 100).toFixed(1);
    
    statusEl.innerText = `₹${spentInView.toLocaleString('en-IN')} / ₹${userBudget.toLocaleString('en-IN')}`;
    percentEl.innerText = `${percentage}%`;
    progressEl.style.width = `${percentage}%`;

    if (percentage < 70) {
        progressEl.style.background = 'var(--success)';
        percentEl.style.color = 'var(--success)';
    } else if (percentage < 90) {
        progressEl.style.background = 'var(--warning)';
        percentEl.style.color = 'var(--warning)';
    } else {
        progressEl.style.background = 'var(--danger)';
        percentEl.style.color = 'var(--danger)';
    }
}

// --- Receipts ---
function viewReceipt(path) {
    document.getElementById('receiptImage').src = path;
    document.getElementById('receiptModal').classList.remove('hidden');
}

function closeReceiptModal() {
    document.getElementById('receiptModal').classList.add('hidden');
}


// --- Exporting ---
function exportToCSV() {
    const filteredExpenses = getFilteredExpenses();
    
    if (filteredExpenses.length === 0) {
        alert("No expenses to export.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Type,Category,Item Name,Date,Amount (INR),Recurring\n";

    filteredExpenses.forEach(exp => {
        const row = `"${exp.type}","${exp.category}","${exp.item_name || ''}","${exp.date || exp.month}",${exp.amount},${exp.is_subscription ? 'Yes' : 'No'}`;
        csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SpendSmart_Export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportToPDF() {
    // We will generate a PDF of the Summary Card and List Card.
    const element = document.getElementById('appScreen');
    
    // Quick style adjustments for printing
    const originalBg = document.body.style.background;
    document.body.style.background = '#0f172a'; // enforce dark bg
    
    const opt = {
      margin:       0.5,
      filename:     'SpendSmart_Tax_Report.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        document.body.style.background = originalBg;
    });
}


// --- Analytics ---
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'Outfit', sans-serif";

async function loadAnalytics() {
    try {
        let res = await fetch('/analytics');
        let data = await res.json();
        
        if(Object.keys(data).length === 0) return;

        renderMonthlyChart(data.monthly);
        renderCategoryChart(data.category);
    } catch (err) {
        console.error("Failed to load analytics", err);
    }
}

function renderMonthlyChart(data) {
    let ctx = document.getElementById("monthlyChart");
    if (monthlyChart) monthlyChart.destroy();

    if (Object.keys(data).length === 0) return;

    monthlyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(data),
            datasets: [{
                label: "Monthly Expenses",
                data: Object.values(data),
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderCategoryChart(data) {
    let ctx = document.getElementById("categoryChart");
    if (categoryChart) categoryChart.destroy();

    if (Object.keys(data).length === 0) return;

    // Build dynamic colors
    let bgColors = [];
    Object.keys(data).forEach(catName => {
        let matched = categories.find(c => c.name === catName);
        bgColors.push(matched ? matched.color : '#64748b');
    });

    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: bgColors,
                borderWidth: 0
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' }
            }
        }
    });
}
