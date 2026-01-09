/**
 * Profile tool - Cross-section/Profile analysis
 * Extracts 2D profile from point cloud along a defined line
 */

import * as THREE from 'three';
import * as viewer from './viewer.js';

// Profile state
let profileLine = null;  // THREE.Line object showing the profile line
let profileStartPoint = null;
let profileEndPoint = null;
let profileThickness = 1.0;  // meters
let isDrawingMode = false;
let profilePoints = null;  // Filtered points for current profile
let profileCanvas = null;  // Reference to profile visualization canvas

/**
 * Calculates distance from a point to a vertical plane defined by a line
 */
function distanceToVerticalPlane(point, lineStart, lineEnd) {
  // Calculate plane normal (perpendicular to line, horizontal)
  const lineDir = new THREE.Vector3().subVectors(lineEnd, lineStart);
  lineDir.z = 0;  // Project to XY plane
  lineDir.normalize();
  
  // Normal is perpendicular to line direction (rotate 90 degrees in XY plane)
  const normal = new THREE.Vector3(-lineDir.y, lineDir.x, 0);
  
  // Vector from line start to point
  const toPoint = new THREE.Vector3().subVectors(point, lineStart);
  
  // Distance is projection onto normal
  return Math.abs(toPoint.dot(normal));
}

/**
 * Calculates distance along the profile line
 */
function distanceAlongLine(point, lineStart, lineEnd) {
  const lineDir = new THREE.Vector3().subVectors(lineEnd, lineStart);
  const lineLength = lineDir.length();
  lineDir.normalize();
  
  const toPoint = new THREE.Vector3().subVectors(point, lineStart);
  return toPoint.dot(lineDir);
}

/**
 * Extracts profile points from point cloud
 * @param {THREE.Vector3} lineStart - Start point of profile line (centered coordinates)
 * @param {THREE.Vector3} lineEnd - End point of profile line (centered coordinates)
 * @param {number} thickness - Thickness of profile slice in meters
 * @param {THREE.Points} pointCloud - Point cloud object
 * @returns {Array} Array of profile points with {distance, z, color}
 */
export function getProfilePoints(lineStart, lineEnd, thickness, pointCloud) {
  if (!pointCloud) return [];
  
  const positions = pointCloud.geometry.attributes.position.array;
  const colors = pointCloud.geometry.attributes.color.array;
  const halfThickness = thickness / 2;
  
  const points = [];
  
  // Iterate through all points
  for (let i = 0; i < positions.length; i += 3) {
    const point = new THREE.Vector3(
      positions[i],
      positions[i + 1],
      positions[i + 2]
    );
    
    // Check if point is within thickness from vertical plane
    const distToPlane = distanceToVerticalPlane(point, lineStart, lineEnd);
    
    if (distToPlane <= halfThickness) {
      // Calculate distance along profile line
      const distAlong = distanceAlongLine(point, lineStart, lineEnd);
      
      // Get color
      const color = new THREE.Color(
        colors[i],
        colors[i + 1],
        colors[i + 2]
      );
      
      points.push({
        distance: distAlong,
        z: point.z,
        color: color,
        distToPlane: distToPlane  // For debugging/filtering
      });
    }
  }
  
  console.log(`Profile: ${points.length} points extracted (thickness: ${thickness}m)`);
  return points;
}

/**
 * Creates or updates the profile line visualization in 3D scene
 */
export function updateProfileLine(scene, startPoint, endPoint) {
  // Remove old line if exists
  if (profileLine) {
    scene.remove(profileLine);
    if (profileLine.geometry) profileLine.geometry.dispose();
    if (profileLine.material) profileLine.material.dispose();
  }
  
  if (!startPoint || !endPoint) return;
  
  // Create line geometry
  const points = [startPoint, endPoint];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  
  // Create red line material
  const material = new THREE.LineBasicMaterial({ 
    color: 0xff0000, 
    linewidth: 3,
    depthTest: false  // Always visible on top
  });
  
  profileLine = new THREE.Line(geometry, material);
  profileLine.renderOrder = 999;  // Render on top
  scene.add(profileLine);
  
  // Store points
  profileStartPoint = startPoint.clone();
  profileEndPoint = endPoint.clone();
}

/**
 * Enables/disables profile drawing mode
 */
export function setDrawingMode(active, camera, renderer, scene, pointCloud, coordinateOffset, onProfileUpdate) {
  isDrawingMode = active;
  
  if (!active) {
    // Remove click listener
    renderer.domElement.removeEventListener('click', handleProfileClick);
    return;
  }
  
  // Reset profile state
  profileStartPoint = null;
  profileEndPoint = null;
  
  console.log('Profile drawing mode activated. Click twice to define profile line.');
  
  // Add click listener
  const handleProfileClick = (event) => {
    if (!isDrawingMode) return;
    
    // Calculate mouse position in normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Raycast to find intersection with point cloud plane
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    // Create a large plane at Z=0 for intersection
    const planeGeometry = new THREE.PlaneGeometry(10000, 10000);
    const planeMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = Math.PI / 2;  // Make it horizontal
    
    // Find intersection point
    const intersects = raycaster.intersectObject(plane);
    
    if (intersects.length > 0) {
      const point = intersects[0].point;
      
      if (!profileStartPoint) {
        // First click - set start point
        profileStartPoint = point.clone();
        console.log(`Profile start: (${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`);
        
        // Create temporary marker
        const markerGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(point);
        marker.name = 'profileStartMarker';
        scene.add(marker);
        
      } else if (!profileEndPoint) {
        // Second click - set end point and create profile
        profileEndPoint = point.clone();
        console.log(`Profile end: (${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`);
        
        // Remove start marker
        const marker = scene.getObjectByName('profileStartMarker');
        if (marker) {
          scene.remove(marker);
          marker.geometry.dispose();
          marker.material.dispose();
        }
        
        // Update profile line visualization
        updateProfileLine(scene, profileStartPoint, profileEndPoint);
        
        // Extract profile points
        profilePoints = getProfilePoints(
          profileStartPoint, 
          profileEndPoint, 
          profileThickness, 
          pointCloud
        );
        
        // Call update callback
        if (onProfileUpdate) {
          onProfileUpdate(profilePoints, profileStartPoint, profileEndPoint, coordinateOffset);
        }
        
        // Disable drawing mode after second click
        isDrawingMode = false;
        renderer.domElement.removeEventListener('click', handleProfileClick);
      }
    }
  };
  
  renderer.domElement.addEventListener('click', handleProfileClick);
}

/**
 * Updates profile with new thickness
 */
export function updateProfileThickness(thickness, pointCloud, coordinateOffset, onProfileUpdate) {
  profileThickness = thickness;
  
  if (profileStartPoint && profileEndPoint && pointCloud) {
    // Re-extract profile points with new thickness
    profilePoints = getProfilePoints(
      profileStartPoint, 
      profileEndPoint, 
      profileThickness, 
      pointCloud
    );
    
    // Call update callback
    if (onProfileUpdate) {
      onProfileUpdate(profilePoints, profileStartPoint, profileEndPoint, coordinateOffset);
    }
  }
}

/**
 * Clears the current profile
 */
export function clearProfile(scene) {
  // Remove profile line
  if (profileLine) {
    scene.remove(profileLine);
    if (profileLine.geometry) profileLine.geometry.dispose();
    if (profileLine.material) profileLine.material.dispose();
    profileLine = null;
  }
  
  // Remove start marker if exists
  const marker = scene.getObjectByName('profileStartMarker');
  if (marker) {
    scene.remove(marker);
    marker.geometry.dispose();
    marker.material.dispose();
  }
  
  // Reset state
  profileStartPoint = null;
  profileEndPoint = null;
  profilePoints = null;
  
  console.log('Profile cleared');
}

/**
 * Gets current profile state
 */
export function getProfileState() {
  return {
    hasProfile: !!(profileStartPoint && profileEndPoint),
    startPoint: profileStartPoint,
    endPoint: profileEndPoint,
    thickness: profileThickness,
    points: profilePoints,
    isDrawing: isDrawingMode
  };
}

/**
 * Draws profile on 2D canvas with dynamic scaling
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Array} profilePoints - Array of profile points
 * @param {THREE.Vector3} lineStart - Start point of profile line
 * @param {THREE.Vector3} lineEnd - End point of profile line
 * @param {Object} coordinateOffset - Coordinate offset {x, y, z}
 * @param {boolean} lockAspectRatio - Whether to lock aspect ratio 1:1
 * @param {number} zoomLevel - Zoom level (1.0 = normal)
 */
export function drawProfileCanvas(canvas, profilePoints, lineStart, lineEnd, coordinateOffset, lockAspectRatio = false, zoomLevel = 1.0) {
  if (!canvas || !profilePoints || profilePoints.length === 0) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  // Clear canvas with dark background
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, width, height);
  
  // Calculate the actual line length (A to B)
  const lineLength = lineStart && lineEnd ? 
    Math.sqrt(
      Math.pow(lineEnd.x - lineStart.x, 2) + 
      Math.pow(lineEnd.y - lineStart.y, 2)
    ) : 0;
  
  // Calculate bounds from profile points
  let minDist = 0; // Always start at 0
  let maxDist = lineLength > 0 ? lineLength : -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (const point of profilePoints) {
    // For max distance, use actual line length or max point distance
    if (lineLength <= 0) {
      maxDist = Math.max(maxDist, point.distance);
    }
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  
  // Ensure we have valid bounds
  if (maxDist <= minDist) maxDist = minDist + 1;
  if (maxZ <= minZ) { minZ -= 0.5; maxZ += 0.5; }
  
  // Add 10% padding to Z-axis for better visualization
  const zPadding = (maxZ - minZ) * 0.1;
  minZ -= zPadding;
  maxZ += zPadding;
  
  const distRange = maxDist - minDist;
  const zRange = maxZ - minZ;
  
  // Padding for axes labels
  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 30;
  const paddingBottom = 40;
  
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  
  // Calculate scale based on aspect ratio setting and zoom level
  let scaleX, scaleZ;
  let actualPlotWidth = plotWidth;
  let actualPlotHeight = plotHeight;
  let offsetX = 0;
  let offsetY = 0;
  
  if (lockAspectRatio) {
    // 1:1 aspect ratio - 1 meter X = 1 meter Y
    const pixelsPerMeterX = plotWidth / distRange;
    const pixelsPerMeterY = plotHeight / zRange;
    const scale = Math.min(pixelsPerMeterX, pixelsPerMeterY) * zoomLevel;
    
    scaleX = scale;
    scaleZ = scale;
    
    // Center the plot
    actualPlotWidth = distRange * scale;
    actualPlotHeight = zRange * scale;
    offsetX = (plotWidth - actualPlotWidth) / 2;
    offsetY = (plotHeight - actualPlotHeight) / 2;
  } else {
    // Stretch to fill with zoom applied
    scaleX = (plotWidth / distRange) * zoomLevel;
    scaleZ = (plotHeight / zRange) * zoomLevel;
    
    // Recalculate actual dimensions with zoom
    actualPlotWidth = distRange * scaleX;
    actualPlotHeight = zRange * scaleZ;
    
    // Center if zoomed in beyond viewport
    if (actualPlotWidth > plotWidth) {
      offsetX = (plotWidth - actualPlotWidth) / 2;
    }
    if (actualPlotHeight > plotHeight) {
      offsetY = (plotHeight - actualPlotHeight) / 2;
    }
  }
  
  // Draw grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  
  // Vertical grid lines
  const numXGridLines = Math.min(10, Math.ceil(distRange));
  const xGridStep = distRange / numXGridLines;
  for (let i = 0; i <= numXGridLines; i++) {
    const dist = minDist + i * xGridStep;
    const x = paddingLeft + offsetX + (dist - minDist) * scaleX;
    ctx.beginPath();
    ctx.moveTo(x, paddingTop + offsetY);
    ctx.lineTo(x, paddingTop + offsetY + actualPlotHeight);
    ctx.stroke();
  }
  
  // Horizontal grid lines
  const numYGridLines = 5;
  const yGridStep = zRange / numYGridLines;
  for (let i = 0; i <= numYGridLines; i++) {
    const z = minZ + i * yGridStep;
    const y = paddingTop + offsetY + actualPlotHeight - (z - minZ) * scaleZ;
    ctx.beginPath();
    ctx.moveTo(paddingLeft + offsetX, y);
    ctx.lineTo(paddingLeft + offsetX + actualPlotWidth, y);
    ctx.stroke();
  }
  
  // Draw points
  const pointSize = Math.max(1, Math.min(3, Math.ceil(1000 / profilePoints.length)));
  for (const point of profilePoints) {
    const x = paddingLeft + offsetX + (point.distance - minDist) * scaleX;
    const y = paddingTop + offsetY + actualPlotHeight - (point.z - minZ) * scaleZ;
    
    // Only draw if within plot area
    if (x >= paddingLeft && x <= width - paddingRight && 
        y >= paddingTop && y <= height - paddingBottom) {
      ctx.fillStyle = `rgb(${Math.floor(point.color.r * 255)}, ${Math.floor(point.color.g * 255)}, ${Math.floor(point.color.b * 255)})`;
      ctx.fillRect(x - pointSize/2, y - pointSize/2, pointSize, pointSize);
    }
  }
  
  // Draw axes
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(paddingLeft, height - paddingBottom);
  ctx.lineTo(width - paddingRight, height - paddingBottom);  // X-axis
  ctx.moveTo(paddingLeft, paddingTop);
  ctx.lineTo(paddingLeft, height - paddingBottom);  // Y-axis
  ctx.stroke();
  
  // Draw tick marks and labels
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px Inter, sans-serif';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  
  // X-axis ticks and labels
  const numXTicks = Math.min(8, Math.max(4, Math.ceil(distRange / 10)));
  for (let i = 0; i <= numXTicks; i++) {
    const frac = i / numXTicks;
    const dist = minDist + frac * distRange;
    const x = paddingLeft + offsetX + frac * actualPlotWidth;
    
    // Tick mark
    ctx.beginPath();
    ctx.moveTo(x, height - paddingBottom);
    ctx.lineTo(x, height - paddingBottom + 5);
    ctx.stroke();
    
    // Label
    ctx.textAlign = 'center';
    ctx.fillText(dist.toFixed(1), x, height - paddingBottom + 18);
  }
  
  // Y-axis ticks and labels
  const numYTicks = 5;
  for (let i = 0; i <= numYTicks; i++) {
    const frac = i / numYTicks;
    const z = minZ + frac * zRange;
    const y = paddingTop + offsetY + actualPlotHeight - frac * actualPlotHeight;
    const originalZ = z + coordinateOffset.z;
    
    // Tick mark
    ctx.beginPath();
    ctx.moveTo(paddingLeft - 5, y);
    ctx.lineTo(paddingLeft, y);
    ctx.stroke();
    
    // Label
    ctx.textAlign = 'right';
    ctx.fillText(originalZ.toFixed(1), paddingLeft - 8, y + 4);
  }
  
  // Axis labels
  ctx.font = '12px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  
  // X-axis label
  ctx.textAlign = 'center';
  ctx.fillText('Distance (m)', width / 2, height - 5);
  
  // Y-axis label
  ctx.save();
  ctx.translate(12, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('Elevation (m)', 0, 0);
  ctx.restore();
  
  // Return bounds info for display
  return {
    lineLength: distRange,
    minZ: minZ + coordinateOffset.z,
    maxZ: maxZ + coordinateOffset.z,
    zRange: zRange,
    pointCount: profilePoints.length
  };
}

/**
 * ProfileTool class - Manages profile creation and visualization
 */
export class ProfileTool {
  constructor(coordinateOffset) {
    this.coordinateOffset = coordinateOffset || { x: 0, y: 0, z: 0 };
    this.profileLine = null;
    this.profileStartPoint = null;
    this.profileEndPoint = null;
    this.profileThickness = 1.0;
    this.isDrawingMode = false;
    this.profilePoints = null;
    this.profileCanvas = null;
    this.profilePanel = null;
    this.clickHandler = null;
    
    // Resize state
    this.isResizing = false;
    this.resizeStartY = 0;
    this.resizeStartHeight = 0;
    
    // Drag state
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragInitialX = 0;
    this.dragInitialY = 0;
    
    // Aspect ratio lock
    this.lockAspectRatio = false;
    
    // Zoom state
    this.zoomLevel = 1.0;
    this.minZoom = 0.5;
    this.maxZoom = 5.0;
    
    // Bound resize handler for cleanup
    this.boundResizeHandler = this.handleWindowResize.bind(this);
    
    // Setup UI
    this.setupUI();
  }
  
  /**
   * Setup profile UI panel
   */
  setupUI() {
    this.profilePanel = document.getElementById('profile-panel');
    this.profileCanvas = document.getElementById('profile-canvas');
    this.profileInfo = document.getElementById('profile-info');
    const resizeHandle = document.getElementById('profile-resize-handle');
    const profileHeader = document.querySelector('.profile-header');
    const aspectLockCheckbox = document.getElementById('profile-aspect-lock');
    
    // Setup resize handle for panel height
    this.setupResizeHandle(resizeHandle);
    
    // Setup dragging for header
    this.setupDragging(profileHeader);
    
    // Setup mouse wheel zoom on canvas
    this.setupWheelZoom(this.profileCanvas);
    
    // Setup aspect ratio toggle
    if (aspectLockCheckbox) {
      aspectLockCheckbox.addEventListener('change', (e) => {
        this.lockAspectRatio = e.target.checked;
        this.zoomLevel = 1.0; // Reset zoom when toggling aspect ratio
        this.updateVisualization();
      });
    }
    
    // Setup window resize handler
    window.addEventListener('resize', this.boundResizeHandler);
    
    // Close button
    document.getElementById('profile-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.hidePanel();
    });
    
    // Zoom controls
    document.getElementById('profile-zoom-in').addEventListener('click', () => {
      this.zoomIn();
    });
    
    document.getElementById('profile-zoom-out').addEventListener('click', () => {
      this.zoomOut();
    });
    
    document.getElementById('profile-zoom-reset').addEventListener('click', () => {
      this.zoomLevel = 1.0;
      this.lockAspectRatio = false;
      if (aspectLockCheckbox) aspectLockCheckbox.checked = false;
      if (this.profilePoints) {
        this.updateVisualization();
      }
    });
  }
  
  /**
   * Zoom in
   */
  zoomIn() {
    this.zoomLevel = Math.min(this.maxZoom, this.zoomLevel * 1.2);
    if (this.profilePoints) {
      this.updateVisualization();
    }
  }
  
  /**
   * Zoom out
   */
  zoomOut() {
    this.zoomLevel = Math.max(this.minZoom, this.zoomLevel / 1.2);
    if (this.profilePoints) {
      this.updateVisualization();
    }
  }
  
  /**
   * Setup mouse wheel zoom on canvas
   */
  setupWheelZoom(canvas) {
    if (!canvas) return;
    
    canvas.addEventListener('wheel', (e) => {
      // Only zoom if we have profile data
      if (!this.profilePoints) return;
      
      e.preventDefault();
      
      // Determine zoom direction
      const delta = -Math.sign(e.deltaY);
      const zoomFactor = delta > 0 ? 1.1 : 0.9;
      
      // Apply zoom with limits
      const newZoom = this.zoomLevel * zoomFactor;
      this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
      
      // Update visualization
      this.updateVisualization();
    }, { passive: false });
  }
  
  /**
   * Setup dragging functionality for panel
   */
  setupDragging(header) {
    if (!header) return;
    
    const onMouseDown = (e) => {
      // Don't drag if clicking on close button or other controls
      if (e.target.id === 'profile-close' || 
          e.target.closest('#profile-close') ||
          e.target.closest('.profile-aspect-toggle')) {
        return;
      }
      
      this.isDragging = true;
      
      const rect = this.profilePanel.getBoundingClientRect();
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragInitialX = rect.left;
      this.dragInitialY = rect.top;
      
      document.body.style.cursor = 'move';
      document.body.style.userSelect = 'none';
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      
      e.preventDefault();
    };
    
    const onMouseMove = (e) => {
      if (!this.isDragging) return;
      
      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;
      
      const newLeft = this.dragInitialX + deltaX;
      const newTop = this.dragInitialY + deltaY;
      
      // Constrain to viewport
      const maxLeft = window.innerWidth - this.profilePanel.offsetWidth;
      const maxTop = window.innerHeight - this.profilePanel.offsetHeight;
      
      const constrainedLeft = Math.max(0, Math.min(newLeft, maxLeft));
      const constrainedTop = Math.max(0, Math.min(newTop, maxTop));
      
      // Update position
      this.profilePanel.style.left = `${constrainedLeft}px`;
      this.profilePanel.style.top = `${constrainedTop}px`;
      this.profilePanel.style.transform = 'none';
      
      e.preventDefault();
    };
    
    const onMouseUp = () => {
      this.isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    header.addEventListener('mousedown', onMouseDown);
  }
  
  /**
   * Handle window resize event
   */
  handleWindowResize() {
    if (this.profilePanel && this.profilePanel.style.display !== 'none') {
      // Debounce resize
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => {
        this.resizeCanvas();
        if (this.profilePoints) {
          this.updateVisualization();
        }
      }, 50);
    }
  }
  
  /**
   * Resize canvas to fit container
   */
  resizeCanvas() {
    if (!this.profileCanvas) return;
    
    const container = this.profileCanvas.parentElement;
    const containerStyle = getComputedStyle(container);
    const paddingX = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
    const paddingY = parseFloat(containerStyle.paddingTop) + parseFloat(containerStyle.paddingBottom);
    
    const width = container.clientWidth - paddingX;
    const height = container.clientHeight - paddingY;
    
    if (width > 0 && height > 0) {
      // Use device pixel ratio for sharp rendering
      const dpr = window.devicePixelRatio || 1;
      this.profileCanvas.width = width * dpr;
      this.profileCanvas.height = height * dpr;
      this.profileCanvas.style.width = `${width}px`;
      this.profileCanvas.style.height = `${height}px`;
      
      // Scale context for high DPI displays
      const ctx = this.profileCanvas.getContext('2d');
      ctx.scale(dpr, dpr);
    }
  }
  
  /**
   * Setup resize handle for panel height adjustment
   */
  setupResizeHandle(handle) {
    if (!handle) return;
    
    const onMouseDown = (e) => {
      this.isResizing = true;
      this.resizeStartY = e.clientY;
      this.resizeStartHeight = this.profilePanel.offsetHeight;
      
      handle.classList.add('active');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      
      e.preventDefault();
      e.stopPropagation();
    };
    
    const onMouseMove = (e) => {
      if (!this.isResizing) return;
      
      const deltaY = this.resizeStartY - e.clientY;
      const newHeight = Math.max(200, Math.min(window.innerHeight * 0.85, this.resizeStartHeight + deltaY));
      
      this.profilePanel.style.height = `${newHeight}px`;
      
      // Resize canvas to fit new size
      this.resizeCanvas();
      
      // Redraw visualization
      if (this.profilePoints) {
        this.updateVisualization();
      }
      
      e.preventDefault();
    };
    
    const onMouseUp = () => {
      this.isResizing = false;
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    handle.addEventListener('mousedown', onMouseDown);
  }
  
  /**
   * Shows the profile panel
   */
  showPanel() {
    if (this.profilePanel) {
      // Make sure panel is positioned correctly before showing
      this.profilePanel.style.display = 'none'; // Ensure it's hidden first
      this.profilePanel.style.left = '50%';
      this.profilePanel.style.top = '50%';
      this.profilePanel.style.transform = 'translate(-50%, -50%)';
      
      // Use requestAnimationFrame to ensure smooth display
      requestAnimationFrame(() => {
        this.profilePanel.style.display = 'flex';
        
        // Add class to body (can be used for styling)
        document.body.classList.add('profile-panel-open');
        
        // Resize canvas after panel is shown
        requestAnimationFrame(() => {
          this.resizeCanvas();
          
          if (this.profilePoints) {
            this.updateVisualization();
          }
        });
      });
    }
  }
  
  /**
   * Hides the profile panel
   */
  hidePanel() {
    if (this.profilePanel) {
      this.profilePanel.style.display = 'none';
      
      // Remove class from body
      document.body.classList.remove('profile-panel-open');
      
      // Clear info display
      if (this.profileInfo) {
        this.profileInfo.textContent = '';
      }
      
      // Reset zoom
      this.zoomLevel = 1.0;
    }
  }
  
  /**
   * Sets coordinate offset
   */
  setCoordinateOffset(offset) {
    this.coordinateOffset = offset;
  }
  
  /**
   * Starts drawing mode
   */
  startDrawing() {
    // Hide panel if it's visible
    this.hidePanel();
    
    this.isDrawingMode = true;
    this.profileStartPoint = null;
    this.profileEndPoint = null;
    
    const scene = viewer.getScene();
    const camera = viewer.getCamera();
    const renderer = viewer.getRenderer();
    const pointCloud = viewer.getPointCloud();
    
    if (!scene || !camera || !renderer || !pointCloud) {
      console.warn('Cannot start profile drawing: missing required components');
      return;
    }
    
    console.log('Profile drawing mode activated. Click twice to define profile line.');
    
    // Create click handler
    this.clickHandler = (event) => {
      if (!this.isDrawingMode) return;
      
      // Calculate mouse position in normalized device coordinates
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Raycast to find intersection with point cloud bounding box center plane
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      
      // Get center Z from point cloud
      pointCloud.geometry.computeBoundingBox();
      const bbox = pointCloud.geometry.boundingBox;
      const centerZ = (bbox.min.z + bbox.max.z) / 2;
      
      // Create a large horizontal plane at center Z for intersection
      const planeGeometry = new THREE.PlaneGeometry(10000, 10000);
      const planeMaterial = new THREE.MeshBasicMaterial({ visible: false });
      const plane = new THREE.Mesh(planeGeometry, planeMaterial);
      plane.position.z = centerZ;
      plane.rotation.x = 0;  // Horizontal plane
      scene.add(plane);
      
      // Find intersection point
      const intersects = raycaster.intersectObject(plane);
      scene.remove(plane);
      plane.geometry.dispose();
      plane.material.dispose();
      
      if (intersects.length > 0) {
        const point = intersects[0].point;
        
        if (!this.profileStartPoint) {
          // First click - set start point
          this.profileStartPoint = point.clone();
          console.log(`Profile start: (${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`);
          
          // Create temporary marker
          const markerGeometry = new THREE.SphereGeometry(0.3, 16, 16);
          const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
          const marker = new THREE.Mesh(markerGeometry, markerMaterial);
          marker.position.copy(point);
          marker.name = 'profileStartMarker';
          scene.add(marker);
          
        } else if (!this.profileEndPoint) {
          // Second click - set end point and create profile
          this.profileEndPoint = point.clone();
          console.log(`Profile end: (${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`);
          
          // Disable drawing mode immediately to prevent further clicks
          this.isDrawingMode = false;
          renderer.domElement.removeEventListener('click', this.clickHandler);
          
          // Remove start marker
          const marker = scene.getObjectByName('profileStartMarker');
          if (marker) {
            scene.remove(marker);
            marker.geometry.dispose();
            marker.material.dispose();
          }
          
          // Update profile line visualization
          updateProfileLine(scene, this.profileStartPoint, this.profileEndPoint);
          this.profileLine = scene.children.find(obj => obj.type === 'Line');
          
          // Extract profile points
          this.profilePoints = getProfilePoints(
            this.profileStartPoint, 
            this.profileEndPoint, 
            this.profileThickness, 
            pointCloud
          );
          
          // Delay showing panel slightly to ensure click is fully processed
          setTimeout(() => {
            // Update visualization
            this.updateVisualization();
            
            // Show panel
            this.showPanel();
          }, 100);
        }
      }
    };
    
    // Add click listener
    renderer.domElement.addEventListener('click', this.clickHandler);
  }
  
  /**
   * Updates thickness and regenerates profile
   */
  updateThickness(thickness) {
    this.profileThickness = thickness;
    
    if (this.profileStartPoint && this.profileEndPoint) {
      const pointCloud = viewer.getPointCloud();
      if (!pointCloud) return;
      
      // Re-extract profile points with new thickness
      this.profilePoints = getProfilePoints(
        this.profileStartPoint, 
        this.profileEndPoint, 
        this.profileThickness, 
        pointCloud
      );
      
      // Update visualization
      this.updateVisualization();
    }
  }
  
  /**
   * Updates the profile canvas visualization
   */
  updateVisualization() {
    if (!this.profileCanvas || !this.profilePoints) return;
    
    // Resize canvas first to ensure proper dimensions
    this.resizeCanvas();
    
    const info = drawProfileCanvas(
      this.profileCanvas, 
      this.profilePoints, 
      this.profileStartPoint, 
      this.profileEndPoint, 
      this.coordinateOffset,
      this.lockAspectRatio,
      this.zoomLevel
    );
    
    // Update info display
    if (this.profileInfo && info) {
      const zoomText = this.zoomLevel !== 1.0 ? ` | Zoom: ${this.zoomLevel.toFixed(1)}x` : '';
      this.profileInfo.textContent = `Length: ${info.lineLength.toFixed(1)}m | Z: ${info.minZ.toFixed(1)} to ${info.maxZ.toFixed(1)}m | ${info.pointCount.toLocaleString()} pts${zoomText}`;
    }
  }
  
  /**
   * Clears the current profile
   */
  clearProfile() {
    const scene = viewer.getScene();
    
    // Remove profile line
    if (this.profileLine) {
      scene.remove(this.profileLine);
      if (this.profileLine.geometry) this.profileLine.geometry.dispose();
      if (this.profileLine.material) this.profileLine.material.dispose();
      this.profileLine = null;
    }
    
    // Remove start marker if exists
    const marker = scene.getObjectByName('profileStartMarker');
    if (marker) {
      scene.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
    }
    
    // Reset state
    this.profileStartPoint = null;
    this.profileEndPoint = null;
    this.profilePoints = null;
    this.isDrawingMode = false;
    
    // Remove click handler if active
    if (this.clickHandler) {
      const renderer = viewer.getRenderer();
      if (renderer) {
        renderer.domElement.removeEventListener('click', this.clickHandler);
      }
    }
    
    // Hide panel
    this.hidePanel();
    
    console.log('Profile cleared');
  }
  
  /**
   * Gets current profile state
   */
  getProfileState() {
    return {
      hasProfile: !!(this.profileStartPoint && this.profileEndPoint),
      startPoint: this.profileStartPoint,
      endPoint: this.profileEndPoint,
      thickness: this.profileThickness,
      points: this.profilePoints,
      isDrawing: this.isDrawingMode
    };
  }
  
  /**
   * Gets profile canvas as data URL for export
   */
  getProfileImageDataURL() {
    if (!this.profileCanvas || !this.profilePoints) return null;
    return this.profileCanvas.toDataURL('image/png', 1.0);
  }
}
