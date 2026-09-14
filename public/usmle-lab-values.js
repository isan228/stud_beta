/**
 * USMLE / NBME-style lab values reference.
 * Shared by test session + review.
 */
(function (global) {
  function row(name, ref, si, indent) {
    return { name, ref: ref || '', si: si || '', indent: indent || 0 };
  }
  function head(name) {
    return { name, ref: '', si: '', header: true, indent: 0 };
  }

  const SERUM = [
    row('Alanine aminotransferase (ALT)', '10-40 U/L', '10-40 U/L'),
    row('Aspartate aminotransferase (AST)', '12-38 U/L', '12-38 U/L'),
    row('Alkaline phosphatase', '25-100 U/L', '25-100 U/L'),
    row('Amylase', '25-125 U/L', '25-125 U/L'),
    head('Bilirubin'),
    row('Total', '0.1-1.0 mg/dL', '2-17 μmol/L', 1),
    row('Direct', '0.0-0.3 mg/dL', '0-5 μmol/L', 1),
    row('Calcium', '8.4-10.2 mg/dL', '2.1-2.6 mmol/L'),
    head('Cholesterol'),
    row('Total', '', '', 1),
    row('Normal', '<200 mg/dL', '<5.2 mmol/L', 2),
    row('High', '>240 mg/dL', '>6.2 mmol/L', 2),
    row('HDL', '40-60 mg/dL', '1.0-1.6 mmol/L', 1),
    row('LDL', '<160 mg/dL', '<4.2 mmol/L', 1),
    head('Triglycerides'),
    row('Normal', '<150 mg/dL', '<1.70 mmol/L', 1),
    row('Borderline', '151-199 mg/dL', '1.71-2.25 mmol/L', 1),
    head('Cortisol'),
    row('0800 h', '5-23 μg/dL', '138-635 nmol/L', 1),
    row('1600 h', '3-15 μg/dL', '82-413 nmol/L', 1),
    row('2000 h', '<50% of 0800 h', 'Fraction of 0800 h: <0.50', 1),
    head('Creatine kinase'),
    row('Male', '25-90 U/L', '25-90 U/L', 1),
    row('Female', '10-70 U/L', '10-70 U/L', 1),
    row('Creatinine', '0.6-1.2 mg/dL', '53-106 μmol/L'),
    row('Urea nitrogen', '7-18 mg/dL', '1.2-3.0 mmol/L'),
    head('Electrolytes, serum'),
    row('Sodium (Na⁺)', '136-146 mEq/L', '136-146 mmol/L', 1),
    row('Potassium (K⁺)', '3.5-5.0 mEq/L', '3.5-5.0 mmol/L', 1),
    row('Chloride (Cl⁻)', '95-105 mEq/L', '95-105 mmol/L', 1),
    row('Bicarbonate (HCO₃⁻)', '22-28 mEq/L', '22-28 mmol/L', 1),
    row('Magnesium (Mg²⁺)', '1.5-2.0 mEq/L', '0.75-1.0 mmol/L', 1),
    head('Ferritin'),
    row('Male', '20-250 ng/mL', '20-250 μg/L', 1),
    row('Female', '10-120 ng/mL', '10-120 μg/L', 1),
    head('Follicle-stimulating hormone'),
    row('Male', '4-25 mIU/mL', '4-25 U/L', 1),
    row('Female', '', '', 1),
    row('premenopause', '4-30 mIU/mL', '4-30 U/L', 2),
    row('midcycle peak', '10-90 mIU/mL', '10-90 U/L', 2),
    row('postmenopause', '40-250 mIU/mL', '40-250 U/L', 2),
    head('Glucose'),
    row('Fasting', '70-110 mg/dL', '3.8-5.6 mmol/L', 1),
    row('Random, non-fasting', '<140 mg/dL', '<7.7 mmol/L', 1),
    head('Growth hormone — arginine stimulation'),
    row('Fasting', '<5 ng/mL', '<5 μg/L', 1),
    row('Provocative stimuli', '>7 ng/mL', '>7 μg/L', 1),
    head('Iron'),
    row('Male', '65-175 μg/dL', '11.6-31.3 μmol/L', 1),
    row('Female', '50-170 μg/dL', '9.0-30.4 μmol/L', 1),
    row('Total iron-binding capacity', '250-400 μg/dL', '44.8-71.6 μmol/L'),
    row('Transferrin', '200-360 mg/dL', '2.0-3.6 g/L'),
    row('Lactate dehydrogenase', '45-200 U/L', '45-200 U/L'),
    head('Luteinizing hormone'),
    row('Male', '6-23 mIU/mL', '6-23 U/L', 1),
    row('Female', '', '', 1),
    row('follicular phase', '5-30 mIU/mL', '5-30 U/L', 2),
    row('midcycle', '75-150 mIU/mL', '75-150 U/L', 2),
    row('postmenopause', '30-200 mIU/mL', '30-200 U/L', 2),
    row('Osmolality', '275-295 mOsmol/kg H₂O', '275-295 mOsmol/kg H₂O'),
    row('Intact parathyroid hormone (PTH)', '10-60 pg/mL', '10-60 ng/mL'),
    row('Phosphorus (inorganic)', '3.0-4.5 mg/dL', '1.0-1.5 mmol/L'),
    head('Prolactin (hPRL)'),
    row('Male', '<17 ng/mL', '<17 μg/L', 1),
    row('Female', '<25 ng/mL', '<25 μg/L', 1),
    head('Proteins'),
    row('Total', '6.0-7.8 g/dL', '60-78 g/L', 1),
    row('Albumin', '3.5-5.5 g/dL', '35-55 g/L', 1),
    row('Globulin', '2.3-3.5 g/dL', '23-35 g/L', 1),
    row('Troponin I', '<0.04 ng/dL', '<0.04 μg/L'),
    row('TSH', '0.4-4.0 μU/mL', '0.4-4.0 μU/mL'),
    row('Thyroidal iodine (¹²³I) uptake', '8%-30% of administered dose/24 h', '0.08-0.30/24 h'),
    row('Thyroxine (T₄)', '5-12 μg/dL', '64-155 nmol/L'),
    row('Free T₄', '0.9-1.7 ng/dL', '12.0-21.9 pmol/L'),
    row('Triiodothyronine (T₃) (RIA)', '100-200 ng/dL', '1.5-3.1 nmol/L'),
    row('Triiodothyronine (T₃) resin uptake', '25%-35%', '0.25-0.35'),
    row('Uric acid', '3.0-8.2 mg/dL', '0.18-0.48 mmol/L'),
    head('Immunoglobulins'),
    row('IgA', '76-390 mg/dL', '0.76-3.90 g/L', 1),
    row('IgE', '0-380 IU/mL', '0-380 kIU/L', 1),
    row('IgG', '650-1500 mg/dL', '6.5-15.0 g/L', 1),
    row('IgM', '50-300 mg/dL', '0.5-3.0 g/L', 1),
    head('Gases, arterial blood (room air)'),
    row('pH', '7.35-7.45', '[H⁺] 36-44 nmol/L', 1),
    row('Pco₂', '33-45 mm Hg', '4.4-5.9 kPa', 1),
    row('Po₂', '75-105 mm Hg', '10.0-14.0 kPa', 1)
  ];

  const CSF = [
    row('Cell count', '0-5/mm³', '0-5 × 10⁶/L'),
    row('Chloride', '118-132 mEq/L', '118-132 mmol/L'),
    row('Gamma globulin', '3%-12% total proteins', '0.03-0.12'),
    row('Glucose', '40-70 mg/dL', '2.2-3.9 mmol/L'),
    row('Pressure', '70-180 mm H₂O', '70-180 mm H₂O'),
    row('Proteins, total', '<40 mg/dL', '<0.40 g/L')
  ];

  const BLOOD = [
    head('Erythrocyte count'),
    row('Male', '4.3-5.9 million/mm³', '4.3-5.9 × 10¹²/L', 1),
    row('Female', '3.5-5.5 million/mm³', '3.5-5.5 × 10¹²/L', 1),
    head('Erythrocyte sedimentation rate (Westergren)'),
    row('Male', '0-15 mm/h', '0-15 mm/h', 1),
    row('Female', '0-20 mm/h', '0-20 mm/h', 1),
    head('Hematocrit'),
    row('Male', '41%-53%', '0.41-0.53', 1),
    row('Female', '36%-46%', '0.36-0.46', 1),
    head('Hemoglobin, blood'),
    row('Male', '13.5-17.5 g/dL', '135-175 g/L', 1),
    row('Female', '12.0-16.0 g/dL', '120-160 g/L', 1),
    row('Hemoglobin A1c', '≤6%', '≤42 mmol/mol'),
    row('Hemoglobin, plasma', '<4 mg/dL', '<0.62 mmol/L'),
    row('Leukocyte count (WBC)', '4500-11,000/mm³', '4.5-11.0 × 10⁹/L'),
    row('Neutrophils, segmented', '54%-62%', '0.54-0.62'),
    row('Neutrophils, bands', '3%-5%', '0.03-0.05'),
    row('Eosinophils', '1%-3%', '0.01-0.03'),
    row('Basophils', '0%-0.75%', '0.00-0.0075'),
    row('Lymphocytes', '25%-33%', '0.25-0.33'),
    row('Monocytes', '3%-7%', '0.03-0.07'),
    row('CD4⁺ T-lymphocyte count', '≥500/mm³', '≥0.5 × 10⁹/L'),
    row('Platelet count', '150,000-400,000/mm³', '150-400 × 10⁹/L'),
    row('Reticulocyte count', '0.5%-1.5%', '0.005-0.015'),
    row('D-Dimer', '≤250 ng/mL', '≤1.4 nmol/L'),
    row('Partial thromboplastin time (PTT) (activated)', '25-40 seconds', '25-40 seconds'),
    row('Prothrombin time (PT)', '11-15 seconds', '11-15 seconds'),
    row('Mean corpuscular hemoglobin (MCH)', '25-35 pg/cell', '0.39-0.54 fmol/cell'),
    row('Mean corpuscular hemoglobin concentration (MCHC)', '31%-36% Hb/cell', '4.8-5.6 mmol Hb/L'),
    row('Mean corpuscular volume (MCV)', '80-100 μm³', '80-100 fL'),
    head('Volume — Plasma'),
    row('Male', '25-43 mL/kg', '0.025-0.043 L/kg', 1),
    row('Female', '28-45 mL/kg', '0.028-0.045 L/kg', 1),
    head('Volume — Red cell'),
    row('Male', '20-36 mL/kg', '0.020-0.036 L/kg', 1),
    row('Female', '19-31 mL/kg', '0.019-0.031 L/kg', 1)
  ];

  const URINE_BMI = [
    row('Calcium', '100-300 mg/24 h', '2.5-7.5 mmol/24 h'),
    head('Creatinine clearance'),
    row('Male', '97-137 mL/min', '97-137 mL/min', 1),
    row('Female', '88-128 mL/min', '88-128 mL/min', 1),
    row('Osmolality', '50-1200 mOsmol/kg H₂O', '50-1200 mmol/kg'),
    row('Oxalate', '8-40 μg/mL', '90-445 μmol/L'),
    row('Proteins, total', '<150 mg/24 h', '<0.15 g/24 h'),
    head('17-Hydroxycorticosteroids'),
    row('Male', '3.0-10.0 mg/24 h', '8.2-27.6 μmol/24 h', 1),
    row('Female', '2.0-8.0 mg/24 h', '5.5-22.0 μmol/24 h', 1),
    head('17-Ketosteroids, total'),
    row('Male', '8-20 mg/24 h', '28-70 μmol/24 h', 1),
    row('Female', '6-15 mg/24 h', '21-52 μmol/24 h', 1),
    row('Body Mass Index (BMI)', 'Adult: 19-25 kg/m²', 'Adult: 19-25 kg/m²')
  ];

  const TABS = [
    { id: 'serum', label: 'Serum', rows: SERUM },
    { id: 'csf', label: 'Cerebrospinal', rows: CSF },
    { id: 'blood', label: 'Blood', rows: BLOOD },
    { id: 'urine', label: 'Urine & BMI', rows: URINE_BMI }
  ];

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function filterRows(rows, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return rows;
    const out = [];
    let lastHeader = null;
    rows.forEach((r) => {
      if (r.header) {
        lastHeader = r;
        return;
      }
      const hay = `${r.name} ${r.ref} ${r.si}`.toLowerCase();
      if (hay.includes(q)) {
        if (lastHeader && (!out.length || out[out.length - 1] !== lastHeader)) {
          out.push(lastHeader);
        }
        out.push(r);
      }
    });
    return out;
  }

  function renderTable(rows) {
    if (!rows.length) {
      return '<p class="uworld-lab-empty">No matching lab values.</p>';
    }
    const body = rows.map((r) => {
      if (r.header) {
        return `<tr class="uworld-lab-section"><td colspan="3">${esc(r.name)}</td></tr>`;
      }
      const pad = r.indent ? ` style="padding-left:${0.75 + r.indent * 0.85}rem"` : '';
      return `<tr>
        <td${pad}>${esc(r.name)}</td>
        <td>${esc(r.ref)}</td>
        <td>${esc(r.si)}</td>
      </tr>`;
    }).join('');
    return `<table class="uworld-lab-ref-table">
      <thead>
        <tr>
          <th>Serum / Analyte</th>
          <th>Reference Range</th>
          <th>SI Reference Interval</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  function mountLabPanel(root) {
    if (!root || root.dataset.labReady === '1') return root;
    root.dataset.labReady = '1';
    root.classList.add('uworld-lab-panel');
    root.innerHTML = `
      <div class="uworld-lab-panel-head">
        <h2>Lab Values</h2>
        <button type="button" class="uworld-lab-panel-close" data-lab-close aria-label="Close">×</button>
      </div>
      <form class="uworld-lab-search" data-lab-search-form>
        <input type="search" placeholder="Search…" data-lab-search autocomplete="off">
        <button type="submit">Search</button>
      </form>
      <div class="uworld-lab-tabs" role="tablist">
        ${TABS.map((t, i) => `
          <button type="button" class="uworld-lab-tab${i === 0 ? ' is-active' : ''}"
            role="tab" data-lab-tab="${t.id}" aria-selected="${i === 0 ? 'true' : 'false'}">${esc(t.label)}</button>
        `).join('')}
      </div>
      <div class="uworld-lab-scroll" data-lab-scroll></div>
    `;

    let activeTab = TABS[0].id;
    let query = '';

    const scroll = root.querySelector('[data-lab-scroll]');
    const searchInput = root.querySelector('[data-lab-search]');

    function paint() {
      const tab = TABS.find((t) => t.id === activeTab) || TABS[0];
      const col0 = activeTab === 'csf' ? 'Cerebrospinal' :
        activeTab === 'blood' ? 'Hematologic' :
        activeTab === 'urine' ? 'Urine / BMI' : 'Serum';
      const rows = filterRows(tab.rows, query);
      const html = renderTable(rows).replace('Serum / Analyte', col0);
      if (scroll) scroll.innerHTML = html;
    }

    root.querySelectorAll('[data-lab-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-lab-tab');
        root.querySelectorAll('[data-lab-tab]').forEach((b) => {
          const on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        paint();
      });
    });

    root.querySelector('[data-lab-search-form]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      query = searchInput?.value || '';
      paint();
    });
    searchInput?.addEventListener('input', () => {
      query = searchInput.value || '';
      paint();
    });

    paint();
    return root;
  }

  global.UsmleLabValues = {
    TABS,
    mountLabPanel,
    filterRows,
    renderTable
  };
})(typeof window !== 'undefined' ? window : globalThis);
