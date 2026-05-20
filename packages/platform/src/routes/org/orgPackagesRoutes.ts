// OrgPackagesRoutes — extracted from orgCrudRoutes.ts
// All route behavior should remain identical.

function registerOrgPackagesRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    requireOrganizationAccess,
    readCourses,
    readPackages,
    writePackages,
    checkExpiredPackages
  } = deps;

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
}

module.exports = { registerOrgPackagesRoutes };
export {};
