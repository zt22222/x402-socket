(function () {
  'use strict';

  const API_BASE = window.location.origin;

  // DOM elements
  const payBtn = document.getElementById('pay-btn');
  const btnText = document.getElementById('btn-text');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const statusFlow = document.getElementById('status-flow');
  const stepPay = document.getElementById('step-pay');
  const stepVerify = document.getElementById('step-verify');
  const stepActive = document.getElementById('step-active');
  const countdownContainer = document.getElementById('countdown-container');
  const countdownText = document.getElementById('countdown-text');
  const countdownProgress = document.getElementById('countdown-progress');
  const resultDiv = document.getElementById('result');
  const resultIcon = document.getElementById('result-icon');
  const resultText = document.getElementById('result-text');
  const errorMsg = document.getElementById('error-msg');
  const fallbackDiv = document.getElementById('fallback');
  const manualTx = document.getElementById('manual-tx');
  const manualVerifyBtn = document.getElementById('manual-verify-btn');
  const qrSection = document.getElementById('qr-section');
  const qrContainer = document.getElementById('qr-container');
  const qrAmountText = document.getElementById('qr-amount-text');
  const qrTestLink = document.getElementById('qr-test-link');

  let paymentParams = null;
  let devicePn = null;
  let pollTimer = null;
  let shutdownToken = null;

  // Get pn from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const urlPn = urlParams.get('pn');

  // Initialize
  init();

  async function init() {
    try {
      const query = urlPn ? `?pn=${urlPn}` : '';
      const res = await fetch(`${API_BASE}/activate${query}`);
      const data = await res.json();

      if (res.status === 402) {
        paymentParams = data.payment;
        devicePn = data.device.id;
        payBtn.disabled = false;
        document.getElementById('device-name').textContent = `Smart Socket ${devicePn}`;

        // Query device status for display only (non-blocking)
        fetchDeviceStatus(devicePn);
      } else {
        showError('Failed to get device info');
      }
    } catch (err) {
      showError('Network error, unable to connect');
    }
  }

  async function fetchDeviceStatus(pn) {
    try {
      const res = await fetch(`${API_BASE}/status?pn=${pn}`);
      const data = await res.json();
      if (data.device) {
        if (data.device.online) {
          statusDot.classList.add('online');
          statusText.textContent = 'Online';
        } else {
          statusDot.classList.add('offline');
          statusText.textContent = 'Offline';
        }
      }
    } catch (err) {
      statusText.textContent = 'Unknown';
    }
  }

  // Pay button click
  payBtn.addEventListener('click', async () => {
    if (!paymentParams) return;
    hideError();

    // Show QR code and start polling
    showQrCode();
    showFallback();

    payBtn.disabled = true;
    btnText.textContent = 'Awaiting payment...';
  });

  // Manual verify button
  manualVerifyBtn.addEventListener('click', async () => {
    const txHash = manualTx.value.trim();
    if (!txHash) return;
    hideError();
    await verifyAndActivate(txHash, true);
  });

  function showQrCode() {
    if (!paymentParams) return;

    qrContainer.innerHTML = '';
    qrAmountText.textContent = paymentParams.amount + ' ' + paymentParams.token;

    // Build pay page URL for QR code
    const payUrl = `${API_BASE}/pay.html?receiver=${paymentParams.receiver}&amount=${paymentParams.amount}&token=${paymentParams.token}&contract=${paymentParams.tokenContract}&chainId=${paymentParams.chainId}&chainName=${paymentParams.chainName}&decimals=${paymentParams.decimals}&amountWei=${paymentParams.amountWei}&projectId=${paymentParams.walletConnectProjectId}`;

    new QRCode(qrContainer, {
      text: payUrl,
      width: 220,
      height: 220,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });

    qrTestLink.href = payUrl;

    qrSection.style.display = 'block';
    showStatusFlow('pay');

    // Start auto-polling for payment
    startPolling();
  }

  function hideQrCode() {
    qrSection.style.display = 'none';
    stopPolling();
  }

  async function startPolling() {
    stopPolling();

    // Get current block number as polling start point
    try {
      const blockRes = await fetch(`${API_BASE}/latest-block`);
      const blockData = await blockRes.json();
      var sinceBlock = blockData.blockNumber;
    } catch (err) {
      return; // Can't start polling without block number
    }

    startPollingFrom(sinceBlock);
  }

  function startPollingFrom(sinceBlock) {
    stopPolling();
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/poll-payment?sinceBlock=${sinceBlock}`);
        const data = await res.json();

        if (data.found && data.txHash) {
          stopPolling();
          var result = await verifyAndActivate(data.txHash);
          if (!result) {
            // Verification failed (e.g. stale tx), resume polling
            startPollingFrom(sinceBlock);
          }
        }
      } catch (err) {
        console.warn('poll-payment error, will retry:', err);
      }
    }, 10000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function verifyAndActivate(txHash, isManual) {
    showStatusFlow('verify');
    payBtn.disabled = true;
    payBtn.classList.add('loading');
    hideError();

    try {
      const res = await fetch(`${API_BASE}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash, pn: devicePn }),
      });

      const data = await res.json();

      if (data.success) {
        shutdownToken = data.shutdownToken;
        showStatusFlow('active');
        hideFallback();
        hideQrCode();
        statusDot.className = 'status-dot online';
        statusText.textContent = 'Activated';
        startCountdown(data.device.duration);
        return true;
      } else {
        if (isManual) {
          showError(data.error || 'Verification failed');
        }
        resetButton();
        return false;
      }
    } catch (err) {
      if (isManual) {
        showError('Verification request failed, please retry');
      }
      resetButton();
      return false;
    }
  }

  function startCountdown(seconds) {
    payBtn.style.display = 'none';
    countdownContainer.style.display = 'block';

    const totalLength = 339.292; // 2 * PI * 54
    let remaining = seconds;

    countdownText.textContent = remaining;
    countdownProgress.style.strokeDashoffset = '0';

    const timer = setInterval(() => {
      remaining--;
      countdownText.textContent = remaining;

      const offset = totalLength * (1 - remaining / seconds);
      countdownProgress.style.strokeDashoffset = offset;

      if (remaining <= 0) {
        clearInterval(timer);
        countdownContainer.style.display = 'none';
        callTurnOff();
      }
    }, 1000);
  }

  async function callTurnOff(attempt) {
    attempt = attempt || 0;
    if (!shutdownToken || !devicePn) {
      onTurnOffDone();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/turn-off`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: shutdownToken, pn: devicePn }),
      });
      const data = await res.json();

      if (data.success || res.status === 400) {
        // 400 means token already consumed or expired — either way, done
        shutdownToken = null;
        onTurnOffDone();
        return;
      }

      throw new Error(data.error || 'turn-off failed');
    } catch (err) {
      if (attempt < 2) {
        setTimeout(function () { callTurnOff(attempt + 1); }, 2000);
      } else {
        shutdownToken = null;
        onTurnOffDone();
      }
    }
  }

  function onTurnOffDone() {
    statusDot.className = 'status-dot';
    statusText.textContent = 'Powered Off';
    showResult('✅', 'Session ended. Thanks for using x402!');
    showRetryButton();
  }

  function showStatusFlow(activeStep) {
    statusFlow.style.display = 'flex';
    const steps = { pay: stepPay, verify: stepVerify, active: stepActive };
    const order = ['pay', 'verify', 'active'];
    const activeIdx = order.indexOf(activeStep);

    order.forEach((key, idx) => {
      steps[key].className = 'step';
      if (idx < activeIdx) steps[key].classList.add('done');
      if (idx === activeIdx) steps[key].classList.add('active');
    });
  }

  function showResult(icon, text) {
    resultDiv.style.display = 'block';
    resultIcon.textContent = icon;
    resultText.textContent = text;
  }

  function showFallback() {
    fallbackDiv.style.display = 'block';
  }

  function hideFallback() {
    fallbackDiv.style.display = 'none';
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
  }

  function hideError() {
    errorMsg.style.display = 'none';
  }

  function resetButton() {
    payBtn.disabled = false;
    payBtn.classList.remove('loading');
    btnText.textContent = 'Pay & Power On';
  }

  function showRetryButton() {
    payBtn.style.display = '';
    payBtn.disabled = false;
    payBtn.classList.remove('loading');
    btnText.textContent = 'Use Again';
    statusFlow.style.display = 'none';
    hideQrCode();

    // Replace click handler to reset to payment state
    payBtn.onclick = function () {
      resultDiv.style.display = 'none';
      btnText.textContent = 'Pay & Power On';
      payBtn.onclick = null; // Restore original listener
      fetchDeviceStatus(devicePn);
    };
  }
})();
