// OrgCoursesRoutes — extracted from orgCrudRoutes.ts
// All route behavior should remain identical.

function registerOrgCoursesRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    requireOrganizationAccess,
    readCourses,
    writeCourses,
    updatePackagesForDeletedCourse
  } = deps;

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
}

module.exports = { registerOrgCoursesRoutes };
export {};
