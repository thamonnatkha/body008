/* ==========================================================
   Body Scent — script.js (ใช้ร่วมกันทุกหน้า)
   - product.html : แสดงสินค้า + กรองตาม mood
   - order.html   : เติมฟอร์มจาก URL + ส่งออเดอร์ไป Apps Script
   - admin.html   : อ่านออเดอร์จาก Google Sheet (CSV) มาแสดงเป็นตาราง
   ========================================================== */

const ORDER_URL =
  'https://script.google.com/macros/s/AKfycbzJKLqaGn8aQpvpdVbLLs1HTbCUlPFsofAbiAn_rUnZdZKXVaSGz-tqu9zoRGxZeQxFcQ/exec';

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT1jdLK8zmkm_-QlloG7LawgomElzrXUqP1MmrLYyrds2XubX6RuLQsM_5ZZh9Gyywc_wAJHxB67pPP/pub?gid=0&single=true&output=csv';

const MOODS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'fresh', label: 'Fresh' },
  { key: 'sweet', label: 'Sweet' },
  { key: 'confident', label: 'Confident' },
  { key: 'romance', label: 'Romance' }
];

/* ---------- ตัวช่วย ---------- */

// สร้าง element แบบสั้นๆ (ใช้ textContent เสมอ ปลอดภัยจาก XSS)
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatPrice(price) {
  return Number(price).toLocaleString('th-TH') + ' บาท';
}

/* ==========================================================
   1) หน้า product.html
   ========================================================== */
function initProductPage() {
  const filterBar = document.getElementById('filter-bar');
  const productList = document.getElementById('product-list');
  if (!filterBar || !productList) return;

  let products = [];
  let currentMood = 'all';

  // อ่าน ?mood=xxx (ถ้าไม่ตรงกับ mood ใดๆ ให้ใช้ 'all')
  const moodParam = new URLSearchParams(window.location.search).get('mood');
  if (moodParam && MOODS.some(m => m.key === moodParam.toLowerCase())) {
    currentMood = moodParam.toLowerCase();
  }

  function renderFilterBar() {
    filterBar.innerHTML = '';
    MOODS.forEach(m => {
      const btn = el('button', m.key === currentMood ? 'active' : '', m.label);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(m.key === currentMood));
      btn.addEventListener('click', () => {
        currentMood = m.key;
        renderFilterBar();
        renderProducts();
      });
      filterBar.appendChild(btn);
    });
  }

  function buildCard(p) {
    const card = el('article', 'product-card');
    card.dataset.mood = p.mood;

    const imgWrap = el('div', 'product-card__image');
    const img = document.createElement('img');
    img.src = p.image;
    img.alt = p.name;
    img.loading = 'lazy';
    imgWrap.appendChild(img);

    const body = el('div', 'product-card__body');

    const meta = el('div', 'product-card__meta');
    meta.appendChild(el('span', 'mood-dot'));
    meta.appendChild(document.createTextNode(p.mood.charAt(0).toUpperCase() + p.mood.slice(1)));

    const name = el('h3', 'product-card__name', p.name);
    body.appendChild(meta);
    body.appendChild(name);

    if (p.size) body.appendChild(el('p', 'product-card__desc', 'ขนาด ' + p.size));
    if (p.description) body.appendChild(el('p', 'product-card__desc', p.description));

    body.appendChild(el('div', 'product-card__price', formatPrice(p.price)));

    // ลิงก์ไปหน้าสั่งซื้อ พร้อม item และ price (encode ให้ปลอดภัยกับภาษาไทย/ช่องว่าง)
    const order = el('a', 'btn btn--accent btn--block', 'สั่งซื้อ');
    order.href =
      'order.html?item=' + encodeURIComponent(p.name) +
      '&price=' + encodeURIComponent(p.price);
    body.appendChild(order);

    card.appendChild(imgWrap);
    card.appendChild(body);
    return card;
  }

  function renderProducts() {
    productList.innerHTML = '';
    const list = currentMood === 'all' ? products : products.filter(p => p.mood === currentMood);
    if (list.length === 0) {
      productList.appendChild(el('p', '', 'ยังไม่มีสินค้าในหมวดนี้'));
      return;
    }
    list.forEach(p => productList.appendChild(buildCard(p)));
  }

  renderFilterBar();

  fetch('products.json')
    .then(res => {
      if (!res.ok) throw new Error('โหลด products.json ไม่สำเร็จ: ' + res.status);
      return res.json();
    })
    .then(data => {
      products = data;
      renderProducts();
    })
    .catch(error => {
      console.error(error);
      productList.innerHTML = '';
      productList.appendChild(el('p', '', 'ไม่สามารถโหลดรายการสินค้าได้ กรุณาลองใหม่อีกครั้ง'));
    });
}

/* ==========================================================
   2) หน้า order.html
   ========================================================== */
function initOrderPage() {
  const form = document.getElementById('orderForm');
  if (!form) return;

  // เติม #items และ #total จาก URL parameter ทันทีที่โหลดหน้า
  const params = new URLSearchParams(window.location.search);
  const item = params.get('item');
  const price = params.get('price');

  const itemsInput = document.getElementById('items');
  const totalInput = document.getElementById('total');

  if (item !== null && itemsInput) itemsInput.value = item;
  if (price !== null && totalInput) totalInput.value = price;

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const payload = {
      customerName: document.getElementById('customerName').value,
      contact: document.getElementById('contact').value,
      items: document.getElementById('items').value,
      total: document.getElementById('total').value,
      note: document.getElementById('note').value
    };

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true; // กันกดซ้ำ

    fetch(ORDER_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(() => { window.location.href = 'thankyou.html'; })
    .catch(error => {
      console.error(error);
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      if (submitBtn) submitBtn.disabled = false;
    });
  });
}

/* ==========================================================
   3) หน้า admin.html
   ========================================================== */

// parse CSV เอง: รองรับ "..." ที่ครอบค่า, comma/ขึ้นบรรทัดใหม่ในค่า, และ "" แทน " ในค่า
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  // ตัด BOM ถ้ามี
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  // แถวสุดท้ายที่ไม่มี newline ปิดท้าย
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // ตัดแถวว่างทั้งแถว
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function initAdminPage() {
  const tbody = document.querySelector('#ordersTable tbody');
  if (!tbody) return;

  const COLS = 6; // วันเวลา, ชื่อลูกค้า, เบอร์โทร/Line, รายการสินค้า, จำนวนเงินรวม, หมายเหตุ

  function showMessage(msg) {
    tbody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = el('td', '', msg);
    td.colSpan = COLS;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  showMessage('กำลังโหลดข้อมูล...');

  // ใส่ timestamp กัน cache ให้เห็นออเดอร์ใหม่เสมอ
  const url = SHEET_CSV_URL + '&_=' + Date.now();

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ: ' + res.status);
      return res.text();
    })
    .then(text => {
      const rows = parseCSV(text);
      const dataRows = rows.slice(1).reverse(); // ข้ามหัวตาราง แล้วเรียงล่าสุดขึ้นก่อน

      if (dataRows.length === 0) {
        showMessage('ยังไม่มีรายการสั่งซื้อ');
        return;
      }

      tbody.innerHTML = '';
      dataRows.forEach(r => {
        const tr = document.createElement('tr');
        for (let i = 0; i < COLS; i++) {
          tr.appendChild(el('td', '', r[i] !== undefined ? r[i] : ''));
        }
        tbody.appendChild(tr);
      });
    })
    .catch(error => {
      console.error(error);
      showMessage('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    });
}

/* ---------- เริ่มทำงาน (แต่ละฟังก์ชันจะทำงานเฉพาะหน้าที่มี element ของมัน) ---------- */
document.addEventListener('DOMContentLoaded', function () {
  initProductPage();
  initOrderPage();
  initAdminPage();
});
