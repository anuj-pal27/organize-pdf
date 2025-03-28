// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Global variables
let mergedPdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let pageThumbnails = [];

// DOM Elements
const pdfInput = document.getElementById('pdfInput');
const dropZone = document.getElementById('dropZone');
const pdfList = document.getElementById('pdfList');
const pdfPreviewArea = document.getElementById('pdfPreviewArea');
const previewContainer = document.getElementById('previewContainer');
const currentPageSpan = document.getElementById('currentPage');
const totalPagesSpan = document.getElementById('totalPages');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const saveChangesBtn = document.getElementById('saveChangesBtn');
const addPdfBtn = document.getElementById('addPdfBtn');

// Event Listeners
pdfInput.addEventListener('change', handleFileSelect);
dropZone.addEventListener('dragover', handleDragOver);
dropZone.addEventListener('drop', handleDrop);
prevPageBtn.addEventListener('click', () => navigatePage(-1));
nextPageBtn.addEventListener('click', () => navigatePage(1));
saveChangesBtn.addEventListener('click', saveReorganizedPDF);
addPdfBtn.addEventListener('click', () => pdfInput.click());

// Handle file selection
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
        await loadPDF(file);
    } else {
        alert('Please select a valid PDF file.');
    }
}

// Handle drag and drop
function handleDragOver(event) {
    event.preventDefault();
    dropZone.classList.add('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    dropZone.classList.remove('dragover');
    
    const file = event.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        loadPDF(file);
    } else {
        alert('Please drop a valid PDF file.');
    }
}

// Load and merge PDF file
async function loadPDF(file) {
    try {
        showLoading();
        const arrayBuffer = await file.arrayBuffer();
        const newPdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
        
        if (!mergedPdfDoc) {
            // First PDF - initialize merged document
            mergedPdfDoc = newPdfDoc;
            totalPages = mergedPdfDoc.numPages;
        } else {
            // Merge with existing PDF
            const newPdfBytes = await newPdfDoc.getData();
            const mergedPdfBytes = await mergedPdfDoc.getData();
            
            // Create new merged PDF using PDF-lib
            const mergedPdfLib = await PDFLib.PDFDocument.create();
            
            // Copy pages from existing PDF
            const existingPages = await mergedPdfLib.copyPages(
                await PDFLib.PDFDocument.load(mergedPdfBytes),
                Array.from({ length: mergedPdfDoc.numPages }, (_, i) => i)
            );
            existingPages.forEach(page => mergedPdfLib.addPage(page));
            
            // Copy pages from new PDF
            const newPages = await mergedPdfLib.copyPages(
                await PDFLib.PDFDocument.load(newPdfBytes),
                Array.from({ length: newPdfDoc.numPages }, (_, i) => i)
            );
            newPages.forEach(page => mergedPdfLib.addPage(page));
            
            // Save merged PDF
            const mergedBytes = await mergedPdfLib.save();
            mergedPdfDoc = await pdfjsLib.getDocument(mergedBytes).promise;
            totalPages = mergedPdfDoc.numPages;
        }
        
        currentPage = 1;
        
        // Update UI
        totalPagesSpan.textContent = totalPages;
        currentPageSpan.textContent = currentPage;
        
        // Show PDF controls
        document.querySelector('.pdf-controls').style.display = 'flex';
        
        // Generate thumbnails for all pages
        await generateThumbnails();
        
        // Show first page
        await showPage(currentPage);
        
        // Enable save button
        saveChangesBtn.disabled = false;
    } catch (error) {
        console.error('Error loading PDF:', error);
        alert('Error loading PDF. Please try again.');
    } finally {
        hideLoading();
    }
}

// Generate thumbnails for all pages
async function generateThumbnails() {
    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.className = 'page-grid';
    
    for (let i = 1; i <= totalPages; i++) {
        const page = await mergedPdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        const thumbnail = createThumbnailElement(canvas, i);
        thumbnailContainer.appendChild(thumbnail);
        pageThumbnails.push(thumbnail);
    }
    
    pdfList.innerHTML = '';
    pdfList.appendChild(thumbnailContainer);
    setupDragAndDrop(thumbnailContainer);
}

// Create thumbnail element
function createThumbnailElement(canvas, pageNumber) {
    const wrapper = document.createElement('div');
    wrapper.className = 'page-thumbnail';
    wrapper.draggable = true;
    wrapper.dataset.pageNumber = pageNumber;
    
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = canvas.height;
    pageCanvas.getContext('2d').drawImage(canvas, 0, 0);
    
    const pageNumberDiv = document.createElement('div');
    pageNumberDiv.className = 'page-number';
    pageNumberDiv.textContent = `Page ${pageNumber}`;
    
    wrapper.appendChild(pageCanvas);
    wrapper.appendChild(pageNumberDiv);
    
    return wrapper;
}

// Setup drag and drop functionality
function setupDragAndDrop(container) {
    let draggedElement = null;

    container.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('page-thumbnail')) {
            draggedElement = e.target;
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = "move"; 
        }
    });

    container.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('page-thumbnail')) {
            e.target.classList.remove('dragging');
            draggedElement = null;
        }
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const thumbnail = e.target.closest('.page-thumbnail');
        if (thumbnail && thumbnail !== draggedElement) {
            thumbnail.classList.add('drag-over');
        }
    });

    container.addEventListener('dragleave', (e) => {
        const thumbnail = e.target.closest('.page-thumbnail');
        if (thumbnail) {
            thumbnail.classList.remove('drag-over');
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        const target = e.target.closest('.page-thumbnail');

        if (target && draggedElement && target !== draggedElement) {
            const parent = container;
            const draggedIndex = [...parent.children].indexOf(draggedElement);
            const targetIndex = [...parent.children].indexOf(target);

            if (draggedIndex < targetIndex) {
                parent.insertBefore(draggedElement, target.nextSibling);
            } else {
                parent.insertBefore(draggedElement, target);
            }

            // Remove highlight effect
            target.classList.remove('drag-over');

            // Update page numbers after moving
            updatePageNumbers();
        }
    });
}

// Update page numbers after reordering
function updatePageNumbers() {
    const thumbnails = document.querySelectorAll('.page-thumbnail');
    thumbnails.forEach((thumb, index) => {
        // Store the original page number in a separate data attribute
        if (!thumb.dataset.originalPageNumber) {
            thumb.dataset.originalPageNumber = thumb.dataset.pageNumber;
        }
        thumb.dataset.currentPosition = index + 1;
        thumb.querySelector('.page-number').textContent = `Page ${index + 1}`;
    });
}

// Show specific page
async function showPage(pageNumber) {
    try {
        const page = await mergedPdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        pdfPreviewArea.innerHTML = '';
        pdfPreviewArea.appendChild(canvas);
        
        // Update navigation buttons
        prevPageBtn.disabled = pageNumber <= 1;
        nextPageBtn.disabled = pageNumber >= totalPages;
    } catch (error) {
        console.error('Error showing page:', error);
        alert('Error showing page. Please try again.');
    }
}

// Navigate between pages
function navigatePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        currentPageSpan.textContent = currentPage;
        showPage(currentPage);
    }
}

// Save reorganized PDF
async function saveReorganizedPDF() {
    try {
        showLoading();
        
        // Get the current order of thumbnails from the DOM
        const thumbnails = document.querySelectorAll('.page-thumbnail');
        const newPageOrder = Array.from(thumbnails).map(thumb => {
            // Get the original page number from the thumbnail
            return parseInt(thumb.dataset.originalPageNumber);
        });
        
        // Create a new PDF document
        const pdfBytes = await mergedPdfDoc.getData();
        const pdfDocLib = await PDFLib.PDFDocument.load(pdfBytes);
        
        // Create a new document for the reordered pages
        const reorderedPdf = await PDFLib.PDFDocument.create();
        
        // Copy pages in the new order
        for (const pageNum of newPageOrder) {
            // Convert to 0-based index for PDF-lib
            const [copiedPage] = await reorderedPdf.copyPages(pdfDocLib, [pageNum - 1]);
            reorderedPdf.addPage(copiedPage);
        }
        
        // Save the modified PDF
        const modifiedPdfBytes = await reorderedPdf.save();
        const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        // Create download link
        const link = document.createElement('a');
        link.href = url;
        link.download = 'reorganized.pdf';
        link.click();
        
        // Cleanup
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error saving PDF:', error);
        alert('Error saving PDF. Please try again.');
    } finally {
        hideLoading();
    }
}

// Loading overlay functions
function showLoading() {
    document.getElementById('loadingOverlay').classList.add('show');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}
