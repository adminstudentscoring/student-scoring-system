          const label = `Monthly (${period} mo)`;
          buttonsHtml += `
            <div class="enroll-option">
              <span class="option-label">${label}</span>
              <button class="btn btn-sm btn-primary" onclick="enrollMonthly('${cls.id}', ${period})">Enroll</button>
            </div>
          `;
      } else {
          const lessonCount = getPackageLessonCount(pkg);
          buttonsHtml += `
            <div class="enroll-option">
              <span class="option-label">All lessons (${lessonCount} lessons from this date)</span>
              <button class="btn btn-sm btn-primary" onclick="enrollConsecutive('${cls.id}', ${lessonCount})">Enroll</button>
            </div>
          `;
      }
    } else if (productType === 'course' && salesState.selectedProduct) {
      const lessonCount = 4;
      buttonsHtml += `
        <div class="enroll-option">
          <span class="option-label">Next 4 lessons</span>
          <button class="btn btn-sm btn-primary" onclick="enrollConsecutive('${cls.id}', ${lessonCount})">Enroll</button>
        </div>
      `;
    }
    
    return `
      <div class="schedule-card">
        <div class="card-time">
          <div class="time-text">${timeStr}</div>
        </div>
        <div class="card-details">
          <div class="card-title">${escapeHtml(cls.entry.className)}</div>
          <div class="card-teacher">${escapeHtml(cls.entry.teacherName || (cls.entry.teacherIds && cls.entry.teacherIds.length > 0 ? getTeacherName(cls.entry.teacherIds[0]) : 'Unknown Teacher'))}</div>
        </div>
        <div class="card-actions">
          ${buttonsHtml}
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
}

// Drop Lesson Logic
window.dropSalesLesson = async function(enrollmentId) {
  if (
    !confirm(
      'Drop this lesson? If it was paid, credit becomes lesson quota for the same per-lesson price tier (not cash balance).'
    )
  )
    return;
  
  try {
    const response = await window.authUtils.authenticatedFetch('/organizations/enrollments/drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: salesState.selectedStudent.id,
        mode: 'single',
        enrollmentId: enrollmentId
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      const toastMsg =
        typeof window.formatDropQuotaToastMessage === 'function'
          ? window.formatDropQuotaToastMessage(result)
          : 'Lesson dropped.';
      if (window.showToast) window.showToast(toastMsg, 'success');
      else alert(toastMsg);

      if (typeof window.applyDropResultToSalesStudent === 'function') {
        window.applyDropResultToSalesStudent(salesState.selectedStudent.id, result);
      }

      if (window.loadTimetableData) await window.loadTimetableData();

      if (typeof window.selectSalesStudent === 'function') {
        window.selectSalesStudent(salesState.selectedStudent.id);
      }
      
      if (salesState.selectedStudent?.id && typeof window.loadStudentOrders === 'function') {
        await window.loadStudentOrders(salesState.selectedStudent.id);
      }
      
      if (salesState.classSelection.courseId) {
          loadAvailableClasses(salesState.classSelection.courseId);
      } else {
          updateDaySchedule();
      }
      
    } else {
      const err = await response.json();
      alert(err.error || 'Failed to drop lesson');
    }
  } catch (e) {
    console.error(e);
    alert('Error processing request');
  }
};

window.dropSalesAllFuture = async function(timetableEntryId, enrollmentDateRaw) {
  const head =
    enrollmentDateRaw != null && String(enrollmentDateRaw).trim()
      ? String(enrollmentDateRaw).trim().split('T')[0].slice(0, 10)
      : '';
  const fromCalendar =
    salesState.classSelection && salesState.classSelection.selectedDate
      ? formatDateForCompare(salesState.classSelection.selectedDate)
      : '';
  const fromStr = /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : fromCalendar;
  if (!fromStr) {
    console.error('[dropSalesAllFuture] missing cutoff date', {
      timetableEntryId,
      enrollmentDateRaw,
      fromCalendar,
      classSelection: !!salesState.classSelection
    });
    alert('Could not determine the start date for drop; please click the lesson day on the calendar again.');
    return;
  }

  console.log('[dropSalesAllFuture] request', {
    timetableEntryId,
    enrollmentDateRaw,
    fromStr,
    fromCalendar,
    studentId: salesState.selectedStudent && salesState.selectedStudent.id
  });

  if (
    !confirm(
      `Drop this class from ${fromStr} onward (including this date)? Earlier dates in this series stay enrolled. This cannot be undone.`
    )
  ) {
    return;
  }

   try {
    const payload = {
      studentId: salesState.selectedStudent.id,
      mode: 'all',
      timetableEntryId: timetableEntryId,
      date: fromStr,
      fromDate: fromStr
    };
    console.log('[dropSalesAllFuture] POST body', payload);
    console.log('[dropSalesAllFuture] POST JSON string', JSON.stringify(payload));
    const response = await window.authUtils.authenticatedFetch('/organizations/enrollments/drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('[dropSalesAllFuture] response', result);
      if (result.dropAll) {
        console.log('[dropSalesAllFuture] server dropAll summary', JSON.stringify(result.dropAll, null, 2));
      }
      const toastMsg =
        typeof window.formatDropQuotaToastMessage === 'function'
          ? window.formatDropQuotaToastMessage(result)
          : `Dropped ${result.droppedCount} lessons.`;
      if (window.showToast) window.showToast(toastMsg, 'success');
      else alert(toastMsg);

      if (typeof window.applyDropResultToSalesStudent === 'function') {
        window.applyDropResultToSalesStudent(salesState.selectedStudent.id, result);
      }

      if (window.loadTimetableData) await window.loadTimetableData();

      if (typeof window.selectSalesStudent === 'function') {
        window.selectSalesStudent(salesState.selectedStudent.id);
      }
      
      if (salesState.selectedStudent?.id && typeof window.loadStudentOrders === 'function') {
        await window.loadStudentOrders(salesState.selectedStudent.id);
      }
      
      if (salesState.classSelection.courseId) {
          loadAvailableClasses(salesState.classSelection.courseId);
      } else {
          updateDaySchedule();
      }
    } else {
      const err = await response.json().catch(() => ({}));
      console.error('[dropSalesAllFuture] error response', response.status, err);
      alert(err.error || err.hint || 'Failed to drop lessons');
    }
   } catch (e) {
       console.error(e);
       alert('Error processing request');
   }
};

window.enrollSingle = function(classInstanceId) {
  const cls = findClassInstance(classInstanceId);
  if (!cls) return;
  addToCart([cls]);
};

window.enrollConsecutive = function(startClassInstanceId, count) {
  const allFuture = salesState.classSelection.availableClasses;
  const startIndex = allFuture.findIndex(c => c.id === startClassInstanceId);
  
  if (startIndex === -1) return;
  
  const startCls = allFuture[startIndex];
  const startTime = startCls.entry.startTime;
  
  const matchingClasses = allFuture.filter((c, idx) => 
    idx >= startIndex && 
    c.entry.startTime === startTime &&
    c.date.getDay() === startCls.date.getDay()
  );
  
  const selected = matchingClasses.slice(0, count);
  
  if (selected.length < count) {
    if(!confirm(`Only ${selected.length} future classes found. Enroll anyway?`)) return;
  }
  
  addToCart(selected);
};

window.enrollMonthly = function(startClassInstanceId, periodMonths) {
  const allFuture = salesState.classSelection.availableClasses;
  const startIndex = allFuture.findIndex(c => c.id === startClassInstanceId);
  
  if (startIndex === -1) return;
  
  const startCls = allFuture[startIndex];
  const startDate = new Date(startCls.date);
  
  const startMonth = startDate.getMonth();
  const startYear = startDate.getFullYear();
  const endDate = new Date(startYear, startMonth + periodMonths, 0);
  endDate.setHours(23, 59, 59, 999);
  
  console.log(`[DEBUG] Enroll Monthly: Start=${startDate.toISOString()}, Period=${periodMonths}, End=${endDate.toISOString()}`);
  
  const startTime = startCls.entry.startTime;
  const startDayOfWeek = startCls.date.getDay();
  
  const selected = allFuture.filter((c, idx) => {
      if (idx < startIndex) return false;
      if (c.date > endDate) return false;
      
      if (c.entry.startTime !== startTime) return false;
      if (c.date.getDay() !== startDayOfWeek) return false;
      
      return true;
  });
  
  console.log(`[DEBUG] Selected ${selected.length} classes`);
  
  if (selected.length === 0) {
      alert('No classes found in the selected period.');
      return;
  }
  
  addToCart(selected);
};

function findClassInstance(id) {
  return salesState.classSelection.availableClasses.find(c => c.id === id);
}

function addToCart(selectedClasses) {
  if (selectedClasses.length === 0) return;
  
  const formattedClasses = selectedClasses.map(cls => ({
      ...cls,
      date: formatDateForCompare(cls.date)
  }));
  
  let price = 0;
  if (salesState.selectedProduct.type === 'package') {
      const pkg = salesState.selectedProduct.data;
      if (salesPackageIsMonthly(pkg)) {
          price = (pkg.monthlyLessonPrice || 0) * selectedClasses.length;
      } else {
          price = calculateSalesPackagePrice(pkg);
      }
  } else {
      price = parseFloat(salesState.selectedProduct.data.price) * selectedClasses.length;
  }
  
  const orderItem = {
    id: Date.now().toString(),
    productType: salesState.selectedProduct.type,
    productData: salesState.selectedProduct.data,
    enrolledClasses: formattedClasses,
    price: price
  };
  
  salesState.cart.push(orderItem);
  renderSalesCart();
  if (typeof updateDaySchedule === 'function') updateDaySchedule();
  if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
}

// Show Student Dropdown

