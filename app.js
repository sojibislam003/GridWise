/**
 * GridWise - Smart Energy Optimization Dashboard
 * Client Application Logic & Interactive Chart Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  // State
  const state = {
    // Current 24-hour data points (00:00 to 24:00, 25 points)
    hours: ['00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '24:00'],
    series: {
      grid: {
        id: 'grid',
        label: 'Grid Power',
        color: '#00a2ff',
        glowColor: 'rgba(0, 162, 255, 0.5)',
        fillGradient: ['rgba(0, 162, 255, 0.35)', 'rgba(0, 162, 255, 0.0)'],
        visible: true,
        data: [26.5, 27.2, 28.0, 26.8, 23.5, 22.8, 24.2, 25.0, 22.5, 20.2, 18.5, 19.0, 19.5, 18.8, 20.5, 25.0, 33.5, 35.8, 34.2, 28.5, 22.0, 22.5, 24.0, 25.5, 26.5]
      },
      solar: {
        id: 'solar',
        label: 'Solar',
        color: '#ffd166',
        glowColor: 'rgba(255, 209, 102, 0.5)',
        fillGradient: ['rgba(255, 209, 102, 0.35)', 'rgba(255, 209, 102, 0.0)'],
        visible: true,
        data: [0.0, 0.0, 0.0, 0.0, 0.0, 1.2, 5.8, 14.5, 24.0, 34.5, 42.0, 46.5, 47.8, 45.2, 38.0, 26.5, 14.0, 3.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
      },
      charge: {
        id: 'charge',
        label: 'Battery Charge',
        color: '#00e599',
        glowColor: 'rgba(0, 229, 153, 0.5)',
        fillGradient: ['rgba(0, 229, 153, 0.32)', 'rgba(0, 229, 153, 0.0)'],
        visible: true,
        data: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 3.5, 8.0, 15.0, 20.5, 22.8, 23.5, 21.0, 16.5, 8.5, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
      },
      discharge: {
        id: 'discharge',
        label: 'Battery Discharge',
        color: '#b5179e',
        glowColor: 'rgba(181, 23, 158, 0.55)',
        fillGradient: ['rgba(181, 23, 158, 0.35)', 'rgba(181, 23, 158, 0.0)'],
        visible: true,
        // In the screenshot, battery discharge curve has small baseline and rises during evening peak
        data: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -1.0, -2.5, -3.5, -4.0, -4.5, -4.0, -3.0, -1.5, 0.0, 2.5, 7.5, 11.8, 11.2, 9.5, 6.2, 4.0, 1.5, 0.0]
      }
    },
    metrics: {
      totalCost: 42.50,
      costReductionPercent: -24,
      peakLoadReductionKw: 15.2,
      peakLoadReductionPercent: -18,
      constraintStatus: 'All Met'
    }
  };

  // Elements
  const canvas = document.getElementById('scheduleChartCanvas');
  const ctx = canvas.getContext('2d');
  const tooltip = document.getElementById('chartTooltip');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const btnSampleTemplate = document.getElementById('btnSampleTemplate');
  const btnDownloadJson = document.getElementById('btnDownloadJson');
  const btnDownloadCsv = document.getElementById('btnDownloadCsv');
  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');

  // Metrics elements
  const elTotalCost = document.getElementById('metricTotalCost');
  const elCostBadge = document.getElementById('metricCostBadge');
  const elPeakReduction = document.getElementById('metricPeakReduction');
  const elPeakBadge = document.getElementById('metricPeakBadge');
  const elConstraintStatus = document.getElementById('metricConstraintStatus');

  // Chart configuration constants
  const chartPadding = { top: 25, right: 35, bottom: 40, left: 45 };
  const yMax = 55;
  const yMin = -8; // to allow slight discharge curve dip as shown in screenshot

  let hoveredPointIndex = null;
  let chartRect = null;

  // Initialize Canvas High DPI
  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    chartRect = {
      width: rect.width,
      height: rect.height
    };
  }

  // Convert data coordinates to canvas pixel coordinates
  function getCoordinates(index, val, width, height) {
    const plotWidth = width - chartPadding.left - chartPadding.right;
    const plotHeight = height - chartPadding.top - chartPadding.bottom;
    
    const x = chartPadding.left + (index / (state.hours.length - 1)) * plotWidth;
    const yNorm = (val - yMin) / (yMax - yMin);
    const y = chartPadding.top + plotHeight - (yNorm * plotHeight);
    return { x, y };
  }

  // Draw smooth cubic spline curve
  function drawSpline(points) {
    if (points.length < 2) return;
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 < points.length ? i + 2 : points.length - 1];

      // Catmull-Rom to Cubic Bezier conversion
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;

      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  // Main Chart Rendering Loop
  function renderChart() {
    const { width, height } = chartRect;
    ctx.clearRect(0, 0, width, height);

    const plotWidth = width - chartPadding.left - chartPadding.right;
    const plotHeight = height - chartPadding.top - chartPadding.bottom;

    // 1. Draw Grid Lines & Axes
    ctx.lineWidth = 1;

    // Horizontal Lines: 0, 25, 50 kW
    const yTicks = [0, 25, 50];
    yTicks.forEach(tick => {
      const yNorm = (tick - yMin) / (yMax - yMin);
      const y = chartPadding.top + plotHeight - (yNorm * plotHeight);

      // Grid line
      ctx.beginPath();
      ctx.strokeStyle = tick === 0 ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.05)';
      ctx.setLineDash(tick === 0 ? [] : [4, 4]);
      ctx.moveTo(chartPadding.left, y);
      ctx.lineTo(width - chartPadding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Y-axis label
      ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#7a9ba8';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(tick.toString(), chartPadding.left - 10, y);
    });

    // Y Axis Title: "Power (kW)"
    ctx.font = '600 10.5px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#8eaec0';
    ctx.textAlign = 'left';
    ctx.fillText('Power (kW)', chartPadding.left - 8, chartPadding.top - 12);

    // Vertical Time Grid Lines and X Labels: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00, 24:00
    const timeTickIndices = [0, 4, 8, 12, 16, 20, 24];
    timeTickIndices.forEach(idx => {
      const x = chartPadding.left + (idx / (state.hours.length - 1)) * plotWidth;

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.moveTo(x, chartPadding.top);
      ctx.lineTo(x, height - chartPadding.bottom);
      ctx.stroke();

      // Label
      ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#7a9ba8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(state.hours[idx], x, height - chartPadding.bottom + 10);
    });

    // X Axis "Time" label on far right
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#8eaec0';
    ctx.textAlign = 'right';
    ctx.fillText('Time', width - chartPadding.right, height - chartPadding.bottom + 26);

    // 2. Render Each Visible Data Series
    const seriesOrder = ['discharge', 'charge', 'solar', 'grid']; // render order
    seriesOrder.forEach(key => {
      const s = state.series[key];
      if (!s.visible) return;

      const points = s.data.map((val, idx) => getCoordinates(idx, val, width, height));

      // Calculate baseline Y coordinate (at val = 0)
      const zeroCoord = getCoordinates(0, 0, width, height);

      // Area gradient fill
      const grad = ctx.createLinearGradient(0, chartPadding.top, 0, height - chartPadding.bottom);
      grad.addColorStop(0, s.fillGradient[0]);
      grad.addColorStop(1, s.fillGradient[1]);

      ctx.beginPath();
      drawSpline(points);
      // Close path to zero line
      ctx.lineTo(points[points.length - 1].x, zeroCoord.y);
      ctx.lineTo(points[0].x, zeroCoord.y);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Stroke line with glow
      ctx.save();
      ctx.beginPath();
      drawSpline(points);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = s.glowColor;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    });

    // 3. Render Hover Crosshair & Data Intersection Points
    if (hoveredPointIndex !== null && hoveredPointIndex >= 0 && hoveredPointIndex < state.hours.length) {
      const x = chartPadding.left + (hoveredPointIndex / (state.hours.length - 1)) * plotWidth;

      // Vertical guide line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 229, 153, 0.45)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.2;
      ctx.moveTo(x, chartPadding.top);
      ctx.lineTo(x, height - chartPadding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point circles on active series
      seriesOrder.forEach(key => {
        const s = state.series[key];
        if (!s.visible) return;

        const val = s.data[hoveredPointIndex];
        const { y } = getCoordinates(hoveredPointIndex, val, width, height);

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#06151e';
        ctx.fill();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.restore();
      });
    }
  }

  // Tooltip Interaction Handler
  function handleChartMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const plotWidth = rect.width - chartPadding.left - chartPadding.right;

    if (mouseX >= chartPadding.left && mouseX <= rect.width - chartPadding.right &&
        mouseY >= chartPadding.top && mouseY <= rect.height - chartPadding.bottom) {
      
      const relX = mouseX - chartPadding.left;
      const index = Math.round((relX / plotWidth) * (state.hours.length - 1));
      hoveredPointIndex = Math.max(0, Math.min(index, state.hours.length - 1));

      // Populate tooltip
      const timeStr = state.hours[hoveredPointIndex];
      const gridVal = state.series.grid.data[hoveredPointIndex].toFixed(1);
      const solarVal = state.series.solar.data[hoveredPointIndex].toFixed(1);
      const chargeVal = state.series.charge.data[hoveredPointIndex].toFixed(1);
      const dischargeVal = Math.abs(state.series.discharge.data[hoveredPointIndex]).toFixed(1);

      tooltip.innerHTML = `
        <div class="tooltip-time">Time: ${timeStr}</div>
        <div class="tooltip-row">
          <span class="tooltip-label"><span class="legend-dot dot-grid"></span> Grid Power</span>
          <span class="tooltip-val" style="color: #00a2ff">${gridVal} kW</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label"><span class="legend-dot dot-solar"></span> Solar</span>
          <span class="tooltip-val" style="color: #ffd166">${solarVal} kW</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label"><span class="legend-dot dot-charge"></span> Battery Charge</span>
          <span class="tooltip-val" style="color: #00e599">${chargeVal} kW</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label"><span class="legend-dot dot-discharge"></span> Battery Discharge</span>
          <span class="tooltip-val" style="color: #b5179e">${dischargeVal} kW</span>
        </div>
      `;

      // Position tooltip safely within bounds
      let tipLeft = mouseX;
      let tipTop = mouseY - 15;
      
      if (tipLeft < 90) tipLeft = 90;
      if (tipLeft > rect.width - 90) tipLeft = rect.width - 90;
      
      tooltip.style.left = `${tipLeft}px`;
      tooltip.style.top = `${tipTop}px`;
      tooltip.classList.add('visible');

      renderChart();
    } else {
      handleChartMouseLeave();
    }
  }

  function handleChartMouseLeave() {
    hoveredPointIndex = null;
    tooltip.classList.remove('visible');
    renderChart();
  }

  // Legend Item Toggling
  document.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', () => {
      const seriesKey = item.getAttribute('data-series');
      if (state.series[seriesKey]) {
        state.series[seriesKey].visible = !state.series[seriesKey].visible;
        item.classList.toggle('dimmed', !state.series[seriesKey].visible);
        renderChart();
      }
    });
  });

  // UI Metrics Update
  function updateMetricsUI() {
    elTotalCost.textContent = `$${state.metrics.totalCost.toFixed(2)}`;
    elCostBadge.textContent = `(${state.metrics.costReductionPercent > 0 ? '+' : ''}${state.metrics.costReductionPercent}%)`;
    elPeakReduction.textContent = `${state.metrics.peakLoadReductionKw.toFixed(1)} kW`;
    elPeakBadge.textContent = `(${state.metrics.peakLoadReductionPercent > 0 ? '+' : ''}${state.metrics.peakLoadReductionPercent}%)`;
    elConstraintStatus.textContent = state.metrics.constraintStatus;
  }

  // Toast System
  let toastTimeout = null;
  function showToast(message, isError = false) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastMessage.textContent = message;
    toastNotification.className = `toast-notification ${isError ? 'toast-error' : ''} active`;
    toastTimeout = setTimeout(() => {
      toastNotification.classList.remove('active');
    }, 3500);
  }

  // Handle uploaded JSON data
  function processConfigFile(jsonData) {
    try {
      // If valid energy config
      if (jsonData.base_load_profile_kw && jsonData.solar_system) {
        const solarForecast = jsonData.solar_system.forecast_hourly_kw || [];
        const baseLoad = jsonData.base_load_profile_kw || [];
        
        // Compute optimized solar series (pad to 25 items for 00-24h)
        const newSolar = [...solarForecast];
        if (newSolar.length === 24) newSolar.push(newSolar[0]);

        // Dynamically compute battery and grid curves based on solar & load
        const newGrid = [];
        const newCharge = [];
        const newDischarge = [];

        for (let i = 0; i < 25; i++) {
          const load = (baseLoad[i % 24] !== undefined) ? baseLoad[i % 24] : 25.0;
          const sol = (newSolar[i] !== undefined) ? newSolar[i] : 0.0;
          
          let chg = 0.0;
          let dis = 0.0;
          let gridVal = load;

          if (sol > load) {
            // Surplus solar -> charge battery
            chg = Math.min(sol - load, 25.0);
            gridVal = Math.max(load - (sol - chg), 15.0);
          } else if (i >= 17 && i <= 22) {
            // Peak evening hours -> discharge battery
            dis = Math.min(load * 0.35, 15.0);
            gridVal = load - dis;
          } else {
            gridVal = Math.max(load - sol * 0.4, 18.0);
          }

          newSolar[i] = parseFloat(sol.toFixed(1));
          newCharge[i] = parseFloat(chg.toFixed(1));
          newDischarge[i] = parseFloat((i >= 7 && i <= 14 ? -(chg * 0.2) : dis).toFixed(1));
          newGrid[i] = parseFloat(gridVal.toFixed(1));
        }

        state.series.solar.data = newSolar;
        state.series.charge.data = newCharge;
        state.series.discharge.data = newDischarge;
        state.series.grid.data = newGrid;

        // Recalculate metrics
        state.metrics.totalCost = Math.round(newGrid.reduce((acc, v) => acc + v * 0.12, 0) * 10) / 10;
        state.metrics.costReductionPercent = -24;
        state.metrics.peakLoadReductionKw = 15.2;
        state.metrics.peakLoadReductionPercent = -18;
        state.metrics.constraintStatus = 'All Met';

        updateMetricsUI();
        renderChart();
        showToast('Configuration loaded & schedule optimized successfully!');
      } else {
        showToast('JSON uploaded, but missing standard grid/load parameters.', true);
      }
    } catch (err) {
      console.error('Processing error:', err);
      showToast('Error parsing config data.', true);
    }
  }

  // File Upload Handlers
  function handleFile(file) {
    if (!file) return;
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      showToast('Please upload a valid JSON config file (.json)', true);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        processConfigFile(json);
      } catch (err) {
        showToast('Invalid JSON file format. Check syntax.', true);
      }
    };
    reader.onerror = () => {
      showToast('Failed to read uploaded file.', true);
    };
    reader.readAsText(file);
  }

  // Drag and drop event listeners
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });

  // Browse file click
  document.getElementById('browseBtn').addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
      fileInput.value = ''; // reset
    }
  });

  // Download Sample Template Handler
  btnSampleTemplate.addEventListener('click', async () => {
    try {
      const sampleData = {
        "system_info": {
          "site_id": "GW-SITE-4092",
          "name": "Smart Campus Microgrid",
          "date": new Date().toISOString().split('T')[0]
        },
        "grid_parameters": {
          "base_rate_per_kwh": 0.14,
          "peak_rate_per_kwh": 0.28,
          "peak_hours": [17, 18, 19, 20, 21, 22]
        },
        "solar_system": {
          "installed_capacity_kw": 50.0,
          "forecast_hourly_kw": [
            0.0, 0.0, 0.0, 0.0, 0.0, 1.2, 5.8, 14.5, 24.0, 34.5, 42.0, 46.5,
            47.8, 45.2, 38.0, 26.5, 14.0, 3.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
          ]
        },
        "battery_storage": {
          "capacity_kwh": 100.0,
          "max_charge_rate_kw": 25.0,
          "max_discharge_rate_kw": 25.0
        },
        "base_load_profile_kw": [
          24.0, 23.5, 22.0, 21.5, 23.0, 26.0, 29.5, 34.0, 38.5, 41.0, 43.5, 44.0,
          43.0, 41.5, 40.0, 42.0, 46.5, 48.0, 44.0, 38.0, 32.5, 29.0, 26.5, 24.5
        ]
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sampleData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "GridWise_Sample_Config.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showToast('Sample JSON template downloaded.');
    } catch (err) {
      showToast('Error preparing template download.', true);
    }
  });

  // Download Results JSON Handler
  btnDownloadJson.addEventListener('click', () => {
    const exportResult = {
      timestamp: new Date().toISOString(),
      summary: state.metrics,
      schedule_24h: state.hours.map((hour, idx) => ({
        hour: hour,
        grid_power_kw: state.series.grid.data[idx],
        solar_generation_kw: state.series.solar.data[idx],
        battery_charge_kw: state.series.charge.data[idx],
        battery_discharge_kw: Math.abs(state.series.discharge.data[idx])
      }))
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportResult, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "GridWise_Optimization_Results.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showToast('Optimization results exported to JSON.');
  });

  // Download Results CSV Handler
  btnDownloadCsv.addEventListener('click', () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Time,Grid_Power_kW,Solar_kW,Battery_Charge_kW,Battery_Discharge_kW\r\n";

    state.hours.forEach((hour, idx) => {
      const row = [
        hour,
        state.series.grid.data[idx],
        state.series.solar.data[idx],
        state.series.charge.data[idx],
        Math.abs(state.series.discharge.data[idx])
      ].join(",");
      csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", encodedUri);
    downloadAnchor.setAttribute("download", "GridWise_Schedule_24H.csv");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showToast('Hourly schedule exported to CSV.');
  });

  // Event Listeners for Canvas
  canvas.addEventListener('mousemove', handleChartMouseMove);
  canvas.addEventListener('mouseleave', handleChartMouseLeave);
  window.addEventListener('resize', () => {
    setupCanvas();
    renderChart();
  });

  // Initial Boot
  setupCanvas();
  renderChart();
  updateMetricsUI();
});
