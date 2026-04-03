// Course, Package, and Timetable management routes extracted from organizationsRoutes.js
// All route behavior should remain identical.

import { Request, Response, NextFunction } from 'express';

function registerOrgCrudRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    authorizeRole,
    requireOrganizationAccess,
    readUsers,
    readOrganizations,
    writeOrganizations,
    readCourses,
    writeCourses,
    readPackages,
    writePackages,
    checkExpiredPackages,
    updatePackagesForDeletedCourse,
    readTimetable,
    writeTimetable,
    readEnrollments,
    writeEnrollments
  } = deps;

  // ==================== Timetable helpers ====================
  function isYmd(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  function parseYmdToUtcMs(ymd) {
    if (!isYmd(ymd)) return null;
    const ms = Date.parse(`${ymd}T00:00:00.000Z`);
    return Number.isFinite(ms) ? ms : null;
  }

  function utcMsToYmd(ms) {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function computeNextAvailableDateSameEntry({ entry, fromDate, holidaySet, enrollments, studentId }) {
    if (!entry || !entry.isRecurring) return null;
    if (!isYmd(fromDate)) return null;

    const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const dowSet = new Set((Array.isArray(entry?.dayOfWeek) ? entry.dayOfWeek : []).map(d => dayMap[d]).filter(v => v !== undefined));
    const startBoundary = entry.startDate ? String(entry.startDate).split('T')[0] : null;
    const endBoundary = entry.endDate ? String(entry.endDate).split('T')[0] : null;

    const exceptions = Array.isArray(entry?.exceptions) ? entry.exceptions : [];
    const exceptionSet = new Set(exceptions.filter(isYmd));

    const allStudentDates = new Set((Array.isArray(enrollments) ? enrollments : [])
      .filter(e =>
        String(e?.studentId) === String(studentId) &&
        String(e?.timetableEntryId) === String(entry.id) &&
        isYmd(e?.date)
      )
      .map(e => e.date)
    );

    const baseMs = parseYmdToUtcMs(fromDate);
    if (baseMs == null) return null;

    for (let i = 1; i <= 365; i++) {
      const ms = baseMs + i * 86400000;
      const ds = utcMsToYmd(ms);

      if (startBoundary && ds < startBoundary) continue;
      if (endBoundary && ds > endBoundary) break;

      if (dowSet.size > 0) {
        const dow = new Date(ms).getUTCDay();
        if (!dowSet.has(dow)) continue;
      }
      if (exceptionSet.has(ds)) continue;
      if (holidaySet && holidaySet.has(ds)) continue;
      if (allStudentDates.has(ds)) continue;

      return ds;
    }

    return null;
  }

  // ==================== Course Management API ====================

  // Get all courses for an organization (organization and admin)
  app.get('/api/organizations/courses', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const courses = await readCourses();

      // Filter by organization
      let filteredCourses = courses;
      if (req.organizationFilter) {
        filteredCourses = courses.filter(c => c.organizationId === req.organizationFilter);
      }

      // Sort by createdAt (newest first) by default
      filteredCourses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json(filteredCourses);
    } catch (error) {
      console.error('Error getting courses:', error);
      res.status(500).json({ error: 'Failed to get courses' });
    }
  });

  // Create a new course (organization and admin)
  app.post('/api/organizations/courses', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { name, price, color } = req.body;

      // Validation
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Course name is required' });
      }

      if (name.length > 50) {
        return res.status(400).json({ error: 'Course name must be 50 characters or less' });
      }

      if (price === undefined || price === null) {
        return res.status(400).json({ error: 'Price is required' });
      }

      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ error: 'Price must be a valid number greater than or equal to 0' });
      }

      // Validate color format if provided
      if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return res.status(400).json({ error: 'Color must be in #RRGGBB format' });
      }

      // Get organization ID
      let organizationId;
      if (req.user.role === 'admin') {
        organizationId = req.body.organizationId || req.organizationFilter;
        if (!organizationId) {
          return res.status(400).json({ error: 'organizationId is required for admin' });
        }
      } else {
        organizationId = req.user.organizationId || req.organizationFilter;
        if (!organizationId) {
          return res.status(403).json({ error: 'Organization not found' });
        }
      }

      // Check if course name already exists in this organization
      const courses = await readCourses();
      const existingCourse = courses.find(c =>
        c.organizationId === organizationId &&
        c.name.toLowerCase().trim() === name.toLowerCase().trim()
      );

      if (existingCourse) {
        return res.status(400).json({ error: 'Course name already exists in this organization' });
      }

      // Create new course
      const newCourse = {
        id: `course_${Date.now()}`,
        organizationId: organizationId,
        name: name.trim(),
        price: priceNum,
        color: color || null,
        category: null,
        level: null,
        description: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      courses.push(newCourse);
      await writeCourses(courses);

      res.status(201).json(newCourse);
    } catch (error) {
      console.error('Error creating course:', error);
      res.status(500).json({ error: 'Failed to create course' });
    }
  });

  // Update a course (organization and admin)
  app.put('/api/organizations/courses/:id', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, price, color } = req.body;

      const courses = await readCourses();
      const courseIndex = courses.findIndex(c => c.id === id);

      if (courseIndex === -1) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const course = courses[courseIndex];

      // Check organization access
      if (req.organizationFilter && course.organizationId !== req.organizationFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Validation
      if (name !== undefined) {
        if (!name || name.trim().length === 0) {
          return res.status(400).json({ error: 'Course name is required' });
        }
        if (name.length > 50) {
          return res.status(400).json({ error: 'Course name must be 50 characters or less' });
        }

        // Check if course name already exists in this organization (excluding current course)
        const existingCourse = courses.find(c =>
          c.id !== id &&
          c.organizationId === course.organizationId &&
          c.name.toLowerCase().trim() === name.toLowerCase().trim()
        );

        if (existingCourse) {
          return res.status(400).json({ error: 'Course name already exists in this organization' });
        }

        course.name = name.trim();
      }

      if (price !== undefined) {
        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum < 0) {
          return res.status(400).json({ error: 'Price must be a valid number greater than or equal to 0' });
        }
        course.price = priceNum;
      }

      if (color !== undefined) {
        if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
          return res.status(400).json({ error: 'Color must be in #RRGGBB format' });
        }
        course.color = color || null;
      }

      course.updatedAt = new Date().toISOString();

      courses[courseIndex] = course;
      await writeCourses(courses);

      res.json(course);
    } catch (error) {
      console.error('Error updating course:', error);
      res.status(500).json({ error: 'Failed to update course' });
    }
  });

  // Delete a single course (organization and admin)
  app.delete('/api/organizations/courses/:id', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { id } = req.params;

      const courses = await readCourses();
      const courseIndex = courses.findIndex(c => c.id === id);

      if (courseIndex === -1) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const course = courses[courseIndex];

      // Check organization access
      if (req.organizationFilter && course.organizationId !== req.organizationFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Update packages that contain this course
      await updatePackagesForDeletedCourse(id);

      courses.splice(courseIndex, 1);
      await writeCourses(courses);

      res.json({ message: 'Course deleted successfully' });
    } catch (error) {
      console.error('Error deleting course:', error);
      res.status(500).json({ error: 'Failed to delete course' });
    }
  });

  // Delete multiple courses (organization and admin)
  app.delete('/api/organizations/courses', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { courseIds } = req.body;

      if (!Array.isArray(courseIds) || courseIds.length === 0) {
        return res.status(400).json({ error: 'courseIds array is required' });
      }

      const courses = await readCourses();
      let deletedCount = 0;

      // Filter courses to delete
      const coursesToDelete = courses.filter(c => {
        if (req.organizationFilter && c.organizationId !== req.organizationFilter) {
          return false;
        }
        return courseIds.includes(c.id);
      });

      // Remove courses
      const remainingCourses = courses.filter(c => !courseIds.includes(c.id) ||
        (req.organizationFilter && c.organizationId !== req.organizationFilter));

      deletedCount = coursesToDelete.length;

      await writeCourses(remainingCourses);

      res.json({
        message: `${deletedCount} course(s) deleted successfully`,
        deletedCount
      });
    } catch (error) {
      console.error('Error deleting courses:', error);
      res.status(500).json({ error: 'Failed to delete courses' });
    }
  });

  // ==================== Course Package Management API ====================

  // Get all packages for an organization (organization and admin)
  app.get('/api/organizations/packages', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      // Check and update expired packages
      let packages = await checkExpiredPackages();

      // Filter by organization
      if (req.organizationFilter) {
        packages = packages.filter(p => p.organizationId === req.organizationFilter);
      }

      // Sort by createdAt (newest first) by default
      packages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json(packages);
    } catch (error) {
      console.error('Error getting packages:', error);
      res.status(500).json({ error: 'Failed to get packages' });
    }
  });

  // Create a new package (organization and admin)
  app.post('/api/organizations/packages', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { name, courses, priceStrategy, fixedPrice, discountPercentage, customPrice, monthlyLessonPrice, monthlyPeriod, description, startDate, endDate, status } = req.body;

      // Validation
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Package name is required' });
      }

      if (name.length > 50) {
        return res.status(400).json({ error: 'Package name must be 50 characters or less' });
      }

      if (!Array.isArray(courses) || courses.length === 0) {
        return res.status(400).json({ error: 'At least one course is required' });
      }

      // Validate courses array
      for (const course of courses) {
        if (!course.courseId || !course.quantity) {
          return res.status(400).json({ error: 'Each course must have courseId and quantity' });
        }
        if (typeof course.quantity !== 'number' || course.quantity < 1 || course.quantity > 999 || !Number.isInteger(course.quantity)) {
          return res.status(400).json({ error: 'Quantity must be an integer between 1 and 999' });
        }
      }

      // Validate price strategy
      if (!priceStrategy || !['fixed', 'discount', 'custom', 'monthly'].includes(priceStrategy)) {
        return res.status(400).json({ error: 'Price strategy must be fixed, discount, custom, or monthly' });
      }

      // Validate price based on strategy
      if (priceStrategy === 'fixed') {
        if (fixedPrice === undefined || fixedPrice === null) {
          return res.status(400).json({ error: 'Fixed price is required for fixed price strategy' });
        }
        const priceNum = parseFloat(fixedPrice);
        if (isNaN(priceNum) || priceNum < 0) {
          return res.status(400).json({ error: 'Fixed price must be a valid number greater than or equal to 0' });
        }
      } else if (priceStrategy === 'discount') {
        if (discountPercentage === undefined || discountPercentage === null) {
          return res.status(400).json({ error: 'Discount percentage is required for discount strategy' });
        }
        const discountNum = parseFloat(discountPercentage);
        if (isNaN(discountNum) || discountNum < 0 || discountNum > 100) {
          return res.status(400).json({ error: 'Discount percentage must be a number between 0 and 100' });
        }
      } else if (priceStrategy === 'custom') {
        if (customPrice === undefined || customPrice === null) {
          return res.status(400).json({ error: 'Custom price is required for custom price strategy' });
        }
        const priceNum = parseFloat(customPrice);
        if (isNaN(priceNum) || priceNum < 0) {
          return res.status(400).json({ error: 'Custom price must be a valid number greater than or equal to 0' });
        }
      } else if (priceStrategy === 'monthly') {
        if (monthlyLessonPrice === undefined || monthlyLessonPrice === null || monthlyPeriod === undefined || monthlyPeriod === null) {
          return res.status(400).json({ error: 'Monthly price and period are required' });
        }
        const priceNum = parseFloat(monthlyLessonPrice);
        const periodNum = parseInt(monthlyPeriod);
        if (isNaN(priceNum) || priceNum < 0) {
          return res.status(400).json({ error: 'Monthly price must be >= 0' });
        }
        if (isNaN(periodNum) || periodNum < 1) {
          return res.status(400).json({ error: 'Period must be >= 1' });
        }
      }

      // Validate dates if provided
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return res.status(400).json({ error: 'Invalid date format' });
        }
        if (end <= start) {
          return res.status(400).json({ error: 'End date must be after start date' });
        }
      }

      // Validate description length
      if (description && description.length > 500) {
        return res.status(400).json({ error: 'Description must be 500 characters or less' });
      }

      // Get organization ID
      let organizationId;
      if (req.user.role === 'admin') {
        organizationId = req.body.organizationId || req.organizationFilter;
        if (!organizationId) {
          return res.status(400).json({ error: 'organizationId is required for admin' });
        }
      } else {
        organizationId = req.user.organizationId || req.organizationFilter;
        if (!organizationId) {
          return res.status(403).json({ error: 'Organization not found' });
        }
      }

      // Check if package name already exists in this organization
      const packages = await readPackages();
      const existingPackage = packages.find(p =>
        p.organizationId === organizationId &&
        p.name.toLowerCase().trim() === name.toLowerCase().trim()
      );

      if (existingPackage) {
        return res.status(400).json({ error: 'Package name already exists in this organization' });
      }

      // Verify all courses exist and belong to the organization
      const allCourses = await readCourses();
      for (const courseItem of courses) {
        const course = allCourses.find(c => c.id === courseItem.courseId);
        if (!course) {
          return res.status(400).json({ error: `Course with ID ${courseItem.courseId} not found` });
        }
        if (course.organizationId !== organizationId) {
          return res.status(403).json({ error: `Course ${courseItem.courseId} does not belong to this organization` });
        }
      }

      // Create new package
      const newPackage = {
        id: `package_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        organizationId: organizationId,
        name: name.trim(),
        courses: courses,
        priceStrategy: priceStrategy,
        fixedPrice: priceStrategy === 'fixed' ? parseFloat(fixedPrice) : null,
        discountPercentage: priceStrategy === 'discount' ? parseFloat(discountPercentage) : null,
        customPrice: priceStrategy === 'custom' ? parseFloat(customPrice) : null,
        monthlyLessonPrice: priceStrategy === 'monthly' ? parseFloat(monthlyLessonPrice) : null,
        monthlyPeriod: priceStrategy === 'monthly' ? parseInt(monthlyPeriod) : null,
        description: description ? description.trim() : null,
        startDate: startDate || null,
        endDate: endDate || null,
        status: status || 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      packages.push(newPackage);
      await writePackages(packages);

      res.status(201).json(newPackage);
    } catch (error) {
      console.error('Error creating package:', error);
      res.status(500).json({ error: 'Failed to create package' });
    }
  });

  // Update a package (organization and admin)
  app.put('/api/organizations/packages/:id', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, courses, priceStrategy, fixedPrice, discountPercentage, customPrice, monthlyLessonPrice, monthlyPeriod, description, startDate, endDate, status } = req.body;

      const packages = await readPackages();
      const packageIndex = packages.findIndex(p => p.id === id);

      if (packageIndex === -1) {
        return res.status(404).json({ error: 'Package not found' });
      }

      const pkg = packages[packageIndex];

      // Check organization access
      if (req.organizationFilter && pkg.organizationId !== req.organizationFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Validation
      if (name !== undefined) {
        if (!name || name.trim().length === 0) {
          return res.status(400).json({ error: 'Package name is required' });
        }
        if (name.length > 50) {
          return res.status(400).json({ error: 'Package name must be 50 characters or less' });
        }

        // Check if package name already exists in this organization (excluding current package)
        const existingPackage = packages.find(p =>
          p.id !== id &&
          p.organizationId === pkg.organizationId &&
          p.name.toLowerCase().trim() === name.toLowerCase().trim()
        );

        if (existingPackage) {
          return res.status(400).json({ error: 'Package name already exists in this organization' });
        }

        pkg.name = name.trim();
      }

      if (courses !== undefined) {
        if (!Array.isArray(courses) || courses.length === 0) {
          return res.status(400).json({ error: 'At least one course is required' });
        }

        // Validate courses array
        for (const course of courses) {
          if (!course.courseId || !course.quantity) {
            return res.status(400).json({ error: 'Each course must have courseId and quantity' });
          }
          if (typeof course.quantity !== 'number' || course.quantity < 1 || course.quantity > 999 || !Number.isInteger(course.quantity)) {
            return res.status(400).json({ error: 'Quantity must be an integer between 1 and 999' });
          }
        }

        // Verify all courses exist and belong to the organization
        const allCourses = await readCourses();
        for (const courseItem of courses) {
          const course = allCourses.find(c => c.id === courseItem.courseId);
          if (!course) {
            return res.status(400).json({ error: `Course with ID ${courseItem.courseId} not found` });
          }
          if (course.organizationId !== pkg.organizationId) {
            return res.status(403).json({ error: `Course ${courseItem.courseId} does not belong to this organization` });
          }
        }

        pkg.courses = courses;
      }

      if (priceStrategy !== undefined) {
        if (!['fixed', 'discount', 'custom', 'monthly'].includes(priceStrategy)) {
          return res.status(400).json({ error: 'Price strategy must be fixed, discount, custom, or monthly' });
        }
        pkg.priceStrategy = priceStrategy;
      }

      if (fixedPrice !== undefined) pkg.fixedPrice = fixedPrice;
      if (discountPercentage !== undefined) pkg.discountPercentage = discountPercentage;
      if (customPrice !== undefined) pkg.customPrice = customPrice;
      if (monthlyLessonPrice !== undefined) pkg.monthlyLessonPrice = monthlyLessonPrice;
      if (monthlyPeriod !== undefined) pkg.monthlyPeriod = monthlyPeriod;

      if (pkg.priceStrategy === 'fixed') {
        if (pkg.fixedPrice === undefined || pkg.fixedPrice === null) return res.status(400).json({ error: 'Fixed price required' });
        const num = parseFloat(pkg.fixedPrice);
        if (isNaN(num) || num < 0) return res.status(400).json({ error: 'Invalid fixed price' });
        pkg.fixedPrice = num;
        pkg.discountPercentage = null;
        pkg.customPrice = null;
        pkg.monthlyLessonPrice = null;
        pkg.monthlyPeriod = null;
      } else if (pkg.priceStrategy === 'discount') {
        if (pkg.discountPercentage === undefined || pkg.discountPercentage === null) return res.status(400).json({ error: 'Discount required' });
        const num = parseFloat(pkg.discountPercentage);
        if (isNaN(num) || num < 0 || num > 100) return res.status(400).json({ error: 'Invalid discount' });
        pkg.discountPercentage = num;
        pkg.fixedPrice = null;
        pkg.customPrice = null;
        pkg.monthlyLessonPrice = null;
        pkg.monthlyPeriod = null;
      } else if (pkg.priceStrategy === 'custom') {
        if (pkg.customPrice === undefined || pkg.customPrice === null) return res.status(400).json({ error: 'Custom price required' });
        const num = parseFloat(pkg.customPrice);
        if (isNaN(num) || num < 0) return res.status(400).json({ error: 'Invalid custom price' });
        pkg.customPrice = num;
        pkg.fixedPrice = null;
        pkg.discountPercentage = null;
        pkg.monthlyLessonPrice = null;
        pkg.monthlyPeriod = null;
      } else if (pkg.priceStrategy === 'monthly') {
        if (pkg.monthlyLessonPrice === undefined || pkg.monthlyLessonPrice === null || !pkg.monthlyPeriod) return res.status(400).json({ error: 'Monthly price/period required' });
        const priceNum = parseFloat(pkg.monthlyLessonPrice);
        const periodNum = parseInt(pkg.monthlyPeriod);
        if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'Invalid monthly price' });
        if (isNaN(periodNum) || periodNum < 1) return res.status(400).json({ error: 'Invalid period' });
        pkg.monthlyLessonPrice = priceNum;
        pkg.monthlyPeriod = periodNum;
        pkg.fixedPrice = null;
        pkg.discountPercentage = null;
        pkg.customPrice = null;
      }

      if (description !== undefined) {
        if (description && description.length > 500) {
          return res.status(400).json({ error: 'Description must be 500 characters or less' });
        }
        pkg.description = description ? description.trim() : null;
      }

      if (startDate !== undefined || endDate !== undefined) {
        const start = startDate ? new Date(startDate) : (pkg.startDate ? new Date(pkg.startDate) : null);
        const end = endDate ? new Date(endDate) : (pkg.endDate ? new Date(pkg.endDate) : null);

        if (start && end) {
          if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: 'Invalid date format' });
          }
          if (end <= start) {
            return res.status(400).json({ error: 'End date must be after start date' });
          }
        }

        if (startDate !== undefined) {
          pkg.startDate = startDate || null;
        }
        if (endDate !== undefined) {
          pkg.endDate = endDate || null;
        }
      }

      if (status !== undefined) {
        if (!['active', 'inactive', 'archived'].includes(status)) {
          return res.status(400).json({ error: 'Status must be active, inactive, or archived' });
        }
        pkg.status = status;
      }

      pkg.updatedAt = new Date().toISOString();

      packages[packageIndex] = pkg;
      await writePackages(packages);

      res.json(pkg);
    } catch (error) {
      console.error('Error updating package:', error);
      res.status(500).json({ error: 'Failed to update package' });
    }
  });

  // Delete a package (organization and admin)
  app.delete('/api/organizations/packages/:id', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { id } = req.params;

      const packages = await readPackages();
      const packageIndex = packages.findIndex(p => p.id === id);

      if (packageIndex === -1) {
        return res.status(404).json({ error: 'Package not found' });
      }

      const pkg = packages[packageIndex];

      // Check organization access
      if (req.organizationFilter && pkg.organizationId !== req.organizationFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }

      packages.splice(packageIndex, 1);
      await writePackages(packages);

      res.json({ message: 'Package deleted successfully' });
    } catch (error) {
      console.error('Error deleting package:', error);
      res.status(500).json({ error: 'Failed to delete package' });
    }
  });

  // ==================== Timetable Management API ====================

  // Get timetable entries (organization and teacher)
  app.get('/api/organizations/timetable', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const timetableData = await readTimetable();

      // Filter by organization
      let filteredEntries = timetableData.entries;
      if (req.organizationFilter) {
        filteredEntries = timetableData.entries.filter(e => e.organizationId === req.organizationFilter);
      }

      const enrollmentsData = await readEnrollments();
      let filteredEnrollments = enrollmentsData;
      if (req.organizationFilter) {
        filteredEnrollments = enrollmentsData.filter(e => e.organizationId === req.organizationFilter);
      }

      res.json({
        entries: filteredEntries,
        metadata: timetableData.metadata,
        enrollments: filteredEnrollments
      });
    } catch (error) {
      console.error('Error getting timetable:', error);
      res.status(500).json({ error: 'Failed to get timetable' });
    }
  });

  // Get timetable entries for teacher (read-only)
  app.get('/api/teachers/timetable', authenticateUser, authorizeRole('teacher'), async (req, res) => {
    try {
      const users = await readUsers();
      const teacher = users.find(u => u.id === req.user.id);

      if (!teacher || !teacher.organizationId) {
        return res.status(403).json({ error: 'Teacher organization not found' });
      }

      const timetableData = await readTimetable();
      const filteredEntries = timetableData.entries.filter(e => e.organizationId === teacher.organizationId);

      const enrollmentsData = await readEnrollments();
      const filteredEnrollments = enrollmentsData.filter(e => e.organizationId === teacher.organizationId);

      const organizations = await readOrganizations();
      const teacherOrg = organizations.find(o => o.id === teacher.organizationId);
      const scheduleSettings =
        teacherOrg && teacherOrg.settings && typeof teacherOrg.settings.scheduleSettings === 'object'
          ? teacherOrg.settings.scheduleSettings
          : {};

      res.json({
        entries: filteredEntries,
        metadata: timetableData.metadata,
        enrollments: filteredEnrollments,
        scheduleSettings
      });
    } catch (error) {
      console.error('Error getting teacher timetable:', error);
      res.status(500).json({ error: 'Failed to get timetable' });
    }
  });

  // Create timetable entry (organization only)
  app.post('/api/organizations/timetable', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { className, startTime, endTime, isRecurring, dayOfWeek, date, startDate, endDate, courseIds, teacherIds, classroom, studentIds, exceptions } = req.body;

      // Validation
      if (!className || className.trim().length === 0) {
        return res.status(400).json({ error: 'Class name is required' });
      }

      if (className.length > 50) {
        return res.status(400).json({ error: 'Class name must be 50 characters or less' });
      }

      if (!startTime || !endTime) {
        return res.status(400).json({ error: 'Start time and end time are required' });
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        return res.status(400).json({ error: 'Time must be in HH:MM format (24-hour)' });
      }

      // Validate start time is before end time
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (startMinutes >= endMinutes) {
        return res.status(400).json({ error: 'Start time must be before end time' });
      }

      if (isRecurring === undefined) {
        return res.status(400).json({ error: 'isRecurring is required' });
      }

      if (isRecurring) {
        if (!dayOfWeek || !Array.isArray(dayOfWeek) || dayOfWeek.length === 0) {
          return res.status(400).json({ error: 'dayOfWeek array is required for recurring classes' });
        }

        const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const invalidDays = dayOfWeek.filter(d => !validDays.includes(d));
        if (invalidDays.length > 0) {
          return res.status(400).json({ error: `Invalid day(s): ${invalidDays.join(', ')}` });
        }

        // Validate startDate and endDate if present
        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          if (start > end) {
            return res.status(400).json({ error: 'Start date cannot be after end date' });
          }
        }
      } else {
        if (!date) {
          return res.status(400).json({ error: 'date is required for non-recurring classes' });
        }
      }

      if (classroom && classroom.length > 50) {
        return res.status(400).json({ error: 'Classroom name must be 50 characters or less' });
      }

      // Get organization ID
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      // Generate unique ID
      const id = `timetable_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create new timetable entry
      const newEntry = {
        id,
        organizationId: orgUser.organizationId,
        className: className.trim(),
        startTime,
        endTime,
        isRecurring,
        dayOfWeek: isRecurring ? dayOfWeek : null,
        date: isRecurring ? null : date,
        startDate: isRecurring ? (startDate || null) : null,
        endDate: isRecurring ? (endDate || null) : null,
        courseIds: Array.isArray(courseIds) ? courseIds : [],
        teacherIds: Array.isArray(teacherIds) ? teacherIds : [],
        classroom: classroom ? classroom.trim() : null,
        studentIds: Array.isArray(studentIds) ? studentIds : [],
        exceptions: Array.isArray(exceptions) ? exceptions : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Read timetable data
      const timetableData = await readTimetable();

      // Add entry
      timetableData.entries.push(newEntry);

      // Update metadata (classNames and classrooms)
      if (!timetableData.metadata.classNames.includes(className.trim())) {
        timetableData.metadata.classNames.push(className.trim());
      }
      if (classroom && classroom.trim() && !timetableData.metadata.classrooms.includes(classroom.trim())) {
        timetableData.metadata.classrooms.push(classroom.trim());
      }

      await writeTimetable(timetableData);

      res.status(201).json(newEntry);
    } catch (error) {
      console.error('Error creating timetable entry:', error);
      res.status(500).json({ error: 'Failed to create timetable entry' });
    }
  });

  // Update timetable entry (organization only)
  app.put('/api/organizations/timetable/:id', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { id } = req.params;
      const { className, startTime, endTime, isRecurring, dayOfWeek, date, startDate, endDate, courseIds, teacherIds, classroom, studentIds, exceptions } = req.body;

      const timetableData = await readTimetable();
      const entryIndex = timetableData.entries.findIndex(e => e.id === id);

      if (entryIndex === -1) {
        return res.status(404).json({ error: 'Timetable entry not found' });
      }

      const entry = timetableData.entries[entryIndex];

      // Verify organization access
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId || entry.organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'You don\'t have permission to update this timetable entry' });
      }

      // Validation (same as create)
      if (className !== undefined) {
        if (!className || className.trim().length === 0) {
          return res.status(400).json({ error: 'Class name is required' });
        }
        if (className.length > 50) {
          return res.status(400).json({ error: 'Class name must be 50 characters or less' });
        }
      }

      if (startTime !== undefined || endTime !== undefined) {
        const finalStartTime = startTime !== undefined ? startTime : entry.startTime;
        const finalEndTime = endTime !== undefined ? endTime : entry.endTime;

        const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(finalStartTime) || !timeRegex.test(finalEndTime)) {
          return res.status(400).json({ error: 'Time must be in HH:MM format (24-hour)' });
        }

        const [startHour, startMin] = finalStartTime.split(':').map(Number);
        const [endHour, endMin] = finalEndTime.split(':').map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        if (startMinutes >= endMinutes) {
          return res.status(400).json({ error: 'Start time must be before end time' });
        }
      }

      if (isRecurring !== undefined) {
        if (isRecurring) {
          if (!dayOfWeek || !Array.isArray(dayOfWeek) || dayOfWeek.length === 0) {
            return res.status(400).json({ error: 'dayOfWeek array is required for recurring classes' });
          }
          const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
          const invalidDays = dayOfWeek.filter(d => !validDays.includes(d));
          if (invalidDays.length > 0) {
            return res.status(400).json({ error: `Invalid day(s): ${invalidDays.join(', ')}` });
          }

          const newStart = startDate !== undefined ? startDate : entry.startDate;
          const newEnd = endDate !== undefined ? endDate : entry.endDate;

          if (newStart && newEnd) {
            const s = new Date(newStart);
            const e = new Date(newEnd);
            if (s > e) {
              return res.status(400).json({ error: 'Start date cannot be after end date' });
            }
          }
        } else {
          if (!date) {
            return res.status(400).json({ error: 'date is required for non-recurring classes' });
          }
        }
      }

      if (classroom && classroom.length > 50) {
        return res.status(400).json({ error: 'Classroom name must be 50 characters or less' });
      }

      // Update entry
      if (className !== undefined) entry.className = className.trim();
      if (startTime !== undefined) entry.startTime = startTime;
      if (endTime !== undefined) entry.endTime = endTime;
      if (isRecurring !== undefined) {
        entry.isRecurring = isRecurring;
        entry.dayOfWeek = isRecurring ? dayOfWeek : null;
        entry.date = isRecurring ? null : date;
        if (isRecurring) {
          if (startDate !== undefined) entry.startDate = startDate || null;
          if (endDate !== undefined) entry.endDate = endDate || null;
        } else {
          entry.startDate = null;
          entry.endDate = null;
        }
      } else if (entry.isRecurring) {
        if (startDate !== undefined) entry.startDate = startDate || null;
        if (endDate !== undefined) entry.endDate = endDate || null;
      }

      if (courseIds !== undefined) entry.courseIds = Array.isArray(courseIds) ? courseIds : [];
      if (teacherIds !== undefined) entry.teacherIds = Array.isArray(teacherIds) ? teacherIds : [];
      if (classroom !== undefined) entry.classroom = classroom ? classroom.trim() : null;
      if (studentIds !== undefined) entry.studentIds = Array.isArray(studentIds) ? studentIds : [];
      if (exceptions !== undefined) entry.exceptions = Array.isArray(exceptions) ? exceptions : [];
      entry.updatedAt = new Date().toISOString();

      // Update metadata
      if (className && !timetableData.metadata.classNames.includes(className.trim())) {
        timetableData.metadata.classNames.push(className.trim());
      }
      if (classroom && classroom.trim() && !timetableData.metadata.classrooms.includes(classroom.trim())) {
        timetableData.metadata.classrooms.push(classroom.trim());
      }

      timetableData.entries[entryIndex] = entry;
      await writeTimetable(timetableData);

      res.json(entry);
    } catch (error) {
      console.error('Error updating timetable entry:', error);
      res.status(500).json({ error: 'Failed to update timetable entry' });
    }
  });

  // Delete timetable entry (organization only)
  app.delete('/api/organizations/timetable/:id', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { id } = req.params;

      const timetableData = await readTimetable();
      const entryIndex = timetableData.entries.findIndex(e => e.id === id);

      if (entryIndex === -1) {
        return res.status(404).json({ error: 'Timetable entry not found' });
      }

      const entry = timetableData.entries[entryIndex];

      // Verify organization access
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId || entry.organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'You don\'t have permission to delete this timetable entry' });
      }

      // Remove entry
      timetableData.entries.splice(entryIndex, 1);
      await writeTimetable(timetableData);

      res.json({ message: 'Timetable entry deleted successfully' });
    } catch (error) {
      console.error('Error deleting timetable entry:', error);
      res.status(500).json({ error: 'Failed to delete timetable entry' });
    }
  });

  // Delete specific instance of recurring class
  app.post('/api/organizations/timetable/:id/delete-instance', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { id } = req.params;
      const { date, mode } = req.body;

      const timetableData = await readTimetable();
      const entryIndex = timetableData.entries.findIndex(e => e.id === id);

      if (entryIndex === -1) return res.status(404).json({ error: 'Entry not found' });
      const entry = timetableData.entries[entryIndex];

      // Verify Org
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId || entry.organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (mode === 'single') {
        if (!entry.exceptions) entry.exceptions = [];
        if (!entry.exceptions.includes(date)) {
          entry.exceptions.push(date);
        }
      } else if (mode === 'future') {
        const targetDate = new Date(date);
        targetDate.setDate(targetDate.getDate() - 1);
        entry.endDate = targetDate.toISOString();
      }

      entry.updatedAt = new Date().toISOString();
      timetableData.entries[entryIndex] = entry;
      await writeTimetable(timetableData);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting instance:', error);
      res.status(500).json({ error: 'Failed to delete instance' });
    }
  });

  // Makeup Class - Drop original and enroll to new class
  app.post('/api/organizations/timetable/makeup', authenticateUser, authorizeRole('organization'), async (req, res) => {
    const logs = [];
    const log = (msg) => {
      console.log('[MAKEUP]', msg);
      logs.push(String(msg));
    };

    try {
      const { studentId, fromEntryId, fromDate, toEntryId, toDate, studentName } = req.body;

      log(`Makeup request: ${studentName} (${studentId}) from ${fromEntryId} on ${fromDate} to ${toEntryId} on ${toDate}`);

      if (!studentId || !fromEntryId || !fromDate || !toEntryId || !toDate) {
        return res.status(400).json({ error: 'Missing required fields', logs });
      }

      if (!req.user || !req.user.organizationId) {
        log('Error: User not authenticated or missing organizationId');
        return res.status(403).json({ error: 'Authentication required', logs });
      }

      const enrollments = await readEnrollments();
      const timetableData = await readTimetable();
      log(`Loaded ${enrollments.length} enrollments`);

      if (enrollments.length > 0) {
        log(`Sample enrollment: ${JSON.stringify(enrollments[0])}`);
      }

      log('Step 1: Finding original enrollment/student to drop');
      log(`Looking for studentId: ${studentId}, timetableEntryId: ${fromEntryId}, date: ${fromDate}`);

      const studentEnrollments = enrollments.filter(e => String(e.studentId) === String(studentId));
      log(`Student has ${studentEnrollments.length} total enrollments`);

      const originalEnrollmentIndex = enrollments.findIndex(e =>
        String(e.studentId) === String(studentId) &&
        e.timetableEntryId === fromEntryId &&
        e.date === fromDate
      );

      let studentRemoved = false;

      if (originalEnrollmentIndex !== -1) {
        const originalEnrollment = enrollments[originalEnrollmentIndex];
        log(`Found original enrollment: ${originalEnrollment.id}`);

        enrollments.splice(originalEnrollmentIndex, 1);
        log('Original enrollment dropped');
        studentRemoved = true;
      } else {
        const fromEntry = timetableData.entries.find(e => e.id === fromEntryId);
        if (fromEntry && fromEntry.studentIds && fromEntry.studentIds.includes(studentId)) {
          const studentIndex = fromEntry.studentIds.indexOf(studentId);
          fromEntry.studentIds.splice(studentIndex, 1);
          log(`Student removed from entry.studentIds at index ${studentIndex}`);
          studentRemoved = true;
        } else {
          log('Warning: Student not found in enrollments or entry.studentIds');
        }
      }

      if (!studentRemoved) {
        log('Warning: Student was not removed from original class, proceeding with new enrollment anyway');
      }

      log('Step 2: Creating new enrollment for target class');

      const existingTargetEnrollment = enrollments.find(e =>
        String(e.studentId) === String(studentId) &&
        e.timetableEntryId === toEntryId &&
        e.date === toDate
      );

      const toEntry = timetableData.entries.find(e => e.id === toEntryId);
      const alreadyInTargetEntry = toEntry && toEntry.studentIds && toEntry.studentIds.includes(studentId);

      if (existingTargetEnrollment || alreadyInTargetEntry) {
        log(`Student already in target class (enrollment: ${!!existingTargetEnrollment}, entry: ${!!alreadyInTargetEntry})`);
      } else {
        const newEnrollment = {
          id: `enr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          organizationId: req.user.organizationId,
          studentId,
          timetableEntryId: toEntryId,
          date: toDate,
          type: 'single',
          notes: `Makeup from ${fromDate} (${fromEntryId})`,
          createdAt: new Date().toISOString(),
          makeupFrom: {
            entryId: fromEntryId,
            date: fromDate,
            reason: 'student_makeup'
          }
        };

        enrollments.push(newEnrollment);
        log(`New enrollment created: ${newEnrollment.id}`);
      }

      await writeEnrollments(enrollments);
      log('Enrollments saved successfully');

      await writeTimetable(timetableData);
      log('Timetable data saved successfully');

      log('Makeup process completed successfully');
      res.json({
        success: true,
        message: 'Student makeup completed',
        logs,
        data: {
          droppedEnrollment: originalEnrollmentIndex !== -1,
          newEnrollmentCreated: !existingTargetEnrollment,
          fromClass: fromEntryId,
          toClass: toEntryId,
          fromDate,
          toDate
        }
      });
    } catch (error) {
      console.error('Error processing makeup:', error);
      log(`Error: ${error.message}`);
      res.status(500).json({ error: 'Failed to process makeup', logs });
    }
  });

  // Postpone Class - Drop current class and enroll in next week's same class
  app.post('/api/organizations/timetable/postpone', authenticateUser, authorizeRole('organization'), async (req, res) => {
    const logs = [];
    const log = (msg) => {
      console.log('[POSTPONE]', msg);
      logs.push(String(msg));
    };

    try {
      const { timetableEntryId, date, studentId } = req.body;

      log(`Postpone request: student ${studentId} from entry ${timetableEntryId} on ${date}`);

      if (!timetableEntryId || !date || !studentId) {
        return res.status(400).json({ error: 'Missing required fields: timetableEntryId, date, studentId', logs });
      }

      if (!req.user || !req.user.organizationId) {
        log('Error: User not authenticated or missing organizationId');
        return res.status(403).json({ error: 'Authentication required', logs });
      }

      const enrollments = await readEnrollments();
      const timetableData = await readTimetable();
      const organizations = await readOrganizations();
      log(`Loaded ${enrollments.length} enrollments, ${timetableData.entries.length} timetable entries`);

      const entry = timetableData.entries.find(e => e.id === timetableEntryId);
      if (!entry) {
        return res.status(404).json({ error: 'Timetable entry not found', logs });
      }

      if (entry.organizationId !== req.user.organizationId) {
        return res.status(403).json({ error: 'Access denied to this timetable entry', logs });
      }

      log('Step 1: Dropping student from current class');

      let studentRemoved = false;
      let originalOrderId = null;
      const originalEnrollmentIndex = enrollments.findIndex(e =>
        String(e.studentId) === String(studentId) &&
        e.timetableEntryId === timetableEntryId &&
        e.date === date
      );

      if (originalEnrollmentIndex !== -1) {
        const originalEnrollment = enrollments[originalEnrollmentIndex];
        log(`Found and removing enrollment: ${originalEnrollment.id}`);
        originalOrderId = originalEnrollment.orderId || null;
        enrollments.splice(originalEnrollmentIndex, 1);
        studentRemoved = true;
      } else {
        if (entry.studentIds && entry.studentIds.includes(studentId)) {
          const studentIndex = entry.studentIds.indexOf(studentId);
          entry.studentIds.splice(studentIndex, 1);
          log(`Removed student from entry.studentIds at index ${studentIndex}`);
          studentRemoved = true;
        }
      }

      if (!studentRemoved) {
        log('Warning: Student was not found in current class, proceeding with new enrollment');
      }

      log('Step 2: Computing next available class date (same class)');

      const org = organizations.find(o => String(o.id) === String(req.user.organizationId));
      const holidays = Array.isArray(org?.settings?.scheduleSettings?.holidays) ? org.settings.scheduleSettings.holidays : [];
      const holidaySet = new Set(holidays.filter(d => typeof d === 'string'));
      const exceptions = Array.isArray(entry?.exceptions) ? entry.exceptions : [];
      const exceptionSet = new Set(exceptions.filter(d => typeof d === 'string'));

      const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
      const dowSet = new Set((Array.isArray(entry?.dayOfWeek) ? entry.dayOfWeek : []).map(d => dayMap[d]).filter(v => v !== undefined));

      const startBoundary = entry.startDate ? String(entry.startDate).split('T')[0] : null;
      const endBoundary = entry.endDate ? String(entry.endDate).split('T')[0] : null;

      const allStudentDates = new Set(enrollments
        .filter(e => String(e.studentId) === String(studentId) && String(e.timetableEntryId) === String(timetableEntryId) && typeof e.date === 'string')
        .map(e => e.date)
      );

      const parseYmd = (s) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return null;
        const ms = Date.parse(`${s}T00:00:00.000Z`);
        return Number.isFinite(ms) ? ms : null;
      };
      const toYmd = (ms) => {
        const d = new Date(ms);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      };

      const baseMs = parseYmd(date);
      if (baseMs == null) return res.status(400).json({ error: 'Invalid date format', logs });

      let targetDate = null;
      for (let i = 1; i <= 365; i++) {
        const ms = baseMs + i * 86400000;
        const ds = toYmd(ms);

        if (startBoundary && ds < startBoundary) continue;
        if (endBoundary && ds > endBoundary) break;
        if (entry.isRecurring) {
          if (dowSet.size > 0) {
            const dow = new Date(ms).getUTCDay();
            if (!dowSet.has(dow)) continue;
          }
        }
        if (exceptionSet.has(ds)) continue;
        if (holidaySet.has(ds)) continue;
        if (allStudentDates.has(ds)) continue;
        targetDate = ds;
        break;
      }

      if (!targetDate) {
        return res.status(400).json({ error: 'No available date found to postpone (check endDate/holidays/exceptions)', logs });
      }

      const targetEntryId = timetableEntryId;
      log(`Target postpone date computed: ${targetDate}`);

      log('Step 3: Creating new enrollment for next week');

      const existingTargetEnrollment = enrollments.find(e =>
        String(e.studentId) === String(studentId) &&
        e.timetableEntryId === targetEntryId &&
        e.date === targetDate
      );

      const targetEntry = timetableData.entries.find(e => e.id === targetEntryId);
      const alreadyInTargetEntry = targetEntry && targetEntry.studentIds && targetEntry.studentIds.includes(studentId);

      if (existingTargetEnrollment || alreadyInTargetEntry) {
        log(`Student already enrolled in target class (enrollment: ${!!existingTargetEnrollment}, entry: ${!!alreadyInTargetEntry})`);
      } else {
        const newEnrollment = {
          id: `enr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          organizationId: req.user.organizationId,
          studentId,
          timetableEntryId: targetEntryId,
          date: targetDate,
          type: 'single',
          orderId: originalOrderId,
          notes: `Postponed from ${date} (${timetableEntryId})`,
          createdAt: new Date().toISOString(),
          postponedFrom: {
            entryId: timetableEntryId,
            date: date,
            reason: 'student_postpone'
          }
        };

        enrollments.push(newEnrollment);
        log(`New enrollment created: ${newEnrollment.id} for ${targetDate}`);
      }

      await writeEnrollments(enrollments);
      log('Enrollments saved successfully');

      await writeTimetable(timetableData);
      log('Timetable data saved successfully');

      log('Postpone process completed successfully');
      res.json({
        success: true,
        message: 'Class postponed successfully',
        logs,
        data: {
          droppedFromClass: timetableEntryId,
          droppedFromDate: date,
          enrolledToClass: targetEntryId,
          enrolledToDate: targetDate,
          studentRemoved,
          newEnrollmentCreated: !existingTargetEnrollment && !alreadyInTargetEntry
        }
      });
    } catch (error) {
      console.error('Error processing postpone:', error);
      log(`Error: ${error.message}`);
      res.status(500).json({ error: 'Failed to process postpone', logs });
    }
  });
}

module.exports = { registerOrgCrudRoutes };
