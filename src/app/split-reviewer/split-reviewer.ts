import {
  Component,
  ElementRef,
  QueryList,
  ViewChild,
  ViewChildren,
  AfterViewInit,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import { DragDropModule, CdkDragEnd } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

interface SplitLine {
  x: number;
  locked?: boolean;
}

@Component({
  selector: 'app-split-reviewer',
  standalone: true,
  imports: [
    CommonModule,
    PdfViewerModule,
    DragDropModule,
    FormsModule,
    HttpClientModule,
  ],
  templateUrl: './split-reviewer.html',
  styleUrls: ['./split-reviewer.css'],
})
export class SplitReviewer implements AfterViewInit, AfterViewChecked {
  pdfSrc =
    'https://publicurl.factsuite.org/File_10653049_File2dd2acc9d8d8bf9f06bf5e4dcbae7010_aiqod_com2_Filefcb41c68ce650374fbe3900427831858_AUTOLI202507215354.pdf';
  pages: number[] = [];

  // Tracks which section indexes are expanded
  expandedSections: Set<number> = new Set();

  constructor(private http: HttpClient) {}

  toggleSection(index: number) {
    if (this.expandedSections.has(index)) {
      this.expandedSections.delete(index);
    } else {
      this.expandedSections.add(index);
    }
  }

  isExpanded(index: number): boolean {
    return this.expandedSections.has(index);
  }

  resData = {
    input_tokens: 1075,
    output_files: [
      {
        is_multipage: true,
        original_file_path:
          'C:/Users/ajink/OneDrive/Desktop/documents\\Mohan R_ BGV Doc.pdf',
        path: 'C:/Users/ajink/OneDrive/Desktop/documents\\Mohan R_ BGV Doc_employment-verification-form_1-2-3-4-5-6.pdf',
        start_page: 1,
      },
      {
        is_multipage: true,
        original_file_path:
          'C:/Users/ajink/OneDrive/Desktop/documents\\Mohan R_ BGV Doc.pdf',
        path: "C:/Users/ajink/OneDrive/Desktop/documents\\Mohan R_ BGV Doc_master's-degree-documents_8-9-10-11-12-13.pdf",
        start_page: 2,
      },
    ],
    output_tokens: 387,
    status: 'success',
    status_code: '200',
    total_tokens: 2157,
  };

  resSections: { start: number; end?: number; name: string }[] = [];

  applyResData() {
    // Step 1: Load snap points
    this.snap_points = this.resData.output_files.map((f) => f.start_page);

    // Step 2: Extract names from filename
    this.resSections = this.resData.output_files.map((f) => {
      const path = f.path;
      const fileName = path.split('\\').pop()?.split('/').pop() || '';
      const nameOnly = fileName.replace(/_/g, ' ').replace(/\.pdf$/, '');
      return {
        start: f.start_page,
        name: nameOnly,
      };
    });

    console.log('Loaded snap points from resData:', this.snap_points);
    console.log('Section names:', this.resSections);
  }

  snap_points = [1];
  sections: { start: number; end: number; name: string }[] = [];

  @ViewChild('pdfStrip', { read: ElementRef }) pdfStripRef!: ElementRef;
  @ViewChildren('snapTarget', { read: ElementRef })
  snapTargets!: QueryList<ElementRef>;

  pdfLoaded = false;
  snapPoints: number[] = [];
  snapPointElements: HTMLElement[] = [];
  snapPointsInitialized = false;

  splitLines: SplitLine[] = [];

  onPdfLoadComplete(pdf: any): void {
    this.pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    this.pdfLoaded = true;
  }

  zoomLevel = 0.95;
  adjustZoom(change: number) {
    const newZoom = this.zoomLevel + change;
    this.zoomLevel = Math.min(0.95, Math.max(0.25, newZoom));
    console.log('Zoom level:', this.zoomLevel);
  }

  getZoomMarginPercent(zoomLevel: number): string {
    const margin = 10 + (1 - zoomLevel) * 75;
    return `${margin}%`;
  }

  ngAfterViewInit(): void {
    this.applyResData();
  }

  ngAfterViewChecked(): void {
    if (
      this.pdfLoaded &&
      !this.snapPointsInitialized &&
      this.snapTargets.length === this.pages.length + 1
    ) {
      this.snapPointsInitialized = true;

      // Allow rendering cycle to stabilize
      setTimeout(() => {
        this.calculateSnapPoints();

        // 💡 Once splitLines are set, generate segments immediately
        this.printSegments();
      }, 100);
    }
  }

  calculateSnapPoints() {
    const container = this.pdfStripRef.nativeElement as HTMLElement;
    this.snapPoints = [];
    this.snapPointElements = [];

    this.snapTargets.forEach((target) => {
      const el = target.nativeElement as HTMLElement;
      this.snapPoints.push(el.offsetLeft);
      this.snapPointElements.push(el);
      el.style.visibility = 'hidden';
    });

    const start = this.snapPoints[0];
    const end = this.snapPoints[this.snapPoints.length - 1];

    this.splitLines = [{ x: start, locked: true }];

    // Add user-defined snap points
    for (const p of this.snap_points) {
      const idx = p - 1;
      if (idx > 0 && idx < this.snapPoints.length - 1) {
        this.splitLines.push({ x: this.snapPoints[idx], locked: false });
      }
    }

    this.splitLines.push({ x: end, locked: true });
  }

  onDragStart(index: number) {
    const line = this.splitLines[index];
    this.originalXMap.set(index, line.x);
  }

  onDragEnd(event: CdkDragEnd, index: number) {
    const container = this.pdfStripRef.nativeElement as HTMLElement;
    const draggedEl = event.source.element.nativeElement as HTMLElement;
    const draggedRect = draggedEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    let relativeX =
      draggedRect.left - containerRect.left + container.scrollLeft;

    const outOfBounds =
      draggedRect.bottom < containerRect.top ||
      draggedRect.top > containerRect.bottom;

    const originalX = this.originalXMap.get(index) ?? this.splitLines[index].x;

    if (outOfBounds) {
      draggedEl.style.transition = 'transform 0.2s ease';
      draggedEl.style.transform = `translateX(${originalX}px)`;
      this.splitLines[index].x = originalX;
      setTimeout(() => {
        draggedEl.style.transition = '';
        draggedEl.style.transform = '';
      }, 200);

      this.snapPointElements.forEach((el) => (el.style.visibility = 'hidden'));
      return;
    }

    // Snap to nearest snap point
    let nearest = this.snapPoints[0];
    let minDiff = Math.abs(relativeX - nearest);
    let nearestIndex = 0;

    for (let i = 1; i < this.snapPoints.length; i++) {
      const diff = Math.abs(relativeX - this.snapPoints[i]);
      if (diff < minDiff) {
        nearest = this.snapPoints[i];
        nearestIndex = i;
        minDiff = diff;
      }
    }

    const draggedLine = this.splitLines[index];
    const originalIndex = this.snapPoints.indexOf(draggedLine.x);

    const sorted = this.splitLines
      .map((l, i) => ({ x: l.x, i }))
      .sort((a, b) => a.x - b.x);
    const isLeftmost = sorted[0].i === index;
    const isRightmost = sorted[sorted.length - 1].i === index;

    // Prevent dragging beyond allowed bounds
    if (
      (isLeftmost && nearestIndex <= originalIndex) ||
      (isRightmost && nearestIndex >= originalIndex)
    ) {
      draggedEl.style.transition = 'transform 0.2s ease';
      draggedEl.style.transform = `translateX(${originalX}px)`;
      this.splitLines[index].x = originalX;
      setTimeout(() => {
        draggedEl.style.transition = '';
        draggedEl.style.transform = '';
      }, 200);

      this.snapPointElements.forEach((el) => (el.style.visibility = 'hidden'));
      return;
    }

    // 🧹 Remove all lines that were crossed OR already exist at destination
    const crossedMin = Math.min(originalX, nearest);
    const crossedMax = Math.max(originalX, nearest);

    this.splitLines = this.splitLines.filter((line, i) => {
      if (i === index) return true; // keep dragged line
      const isCrossed = line.x > crossedMin && line.x < crossedMax;
      const isAtDestination = line.x === nearest;
      return !isCrossed && !isAtDestination;
    });

    // 📌 Now handle locked/unlocked move
    if (draggedLine.locked) {
      // Clone locked line, convert dragged to editable at new position
      this.splitLines.splice(index, 0, { x: draggedLine.x, locked: true });
      this.splitLines[index + 1] = { x: nearest, locked: false };
    } else {
      draggedLine.x = nearest;
    }

    // ✅ Overlap cleanup for editable lines
    const lockedLines = this.splitLines.filter((line) => line.locked);
    const editableLines = this.splitLines.filter((line) => !line.locked);

    const seen = new Set<number>();
    const overlapThreshold = 1;

    const filtered = editableLines.filter((line) => {
      for (const sx of seen) {
        if (Math.abs(sx - line.x) <= overlapThreshold) return false;
      }
      seen.add(line.x);
      return true;
    });

    this.splitLines = [...lockedLines, ...filtered].sort((a, b) => a.x - b.x);

    this.snapPointElements.forEach((el, i) => {
      el.style.visibility = i === nearestIndex ? 'visible' : 'hidden';
    });

    this.printSegments();
  }

  private originalXMap = new Map<number, number>();

  printSegments() {
    console.log('printing segments');
    console.log('Zoom level:', this.zoomLevel);

    const sorted = this.splitLines
      .map((s) => this.snapPoints.indexOf(s.x))
      .filter((i) => i !== -1)
      .sort((a, b) => a - b);

    const segments = [];
    const meta = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];

      if (from >= 0 && to > from && to <= this.pages.length) {
        const startPage = this.pages[from];
        const endPage = this.pages[to - 1];

        // Try to find matching resSection based on startPage
        const matched = this.resSections.find((r) => r.start === startPage);
        let name = matched?.name || `Section ${i + 1}`;

        // Extract clean name
        name =
          name
            .replace(/[_\\]/g, ' ')
            .split(' ')
            .filter((part) => !/^\d+(-\d+)*$/.test(part))
            .slice(-1)[0] || `Section ${i + 1}`;

        meta.push({
          start: startPage,
          end: endPage,
          name,
        });

        segments.push(this.pages.slice(from, to));
      }
    }

    this.sections = meta;

    console.log('Split Segments:', segments);
  }

  editingIndex: number | null = null;

  enableEdit(index: number, event: MouseEvent) {
    event.stopPropagation();
    this.editingIndex = index;
  }

  disableEdit() {
    this.editingIndex = null;
  }

  get sectionNames(): string[] {
    return this.sections.map((s) => s.name);
  }

  get sectionStartPages(): number[] {
    return this.sections.map((s) => s.start);
  }

  get sectionEndPages(): number[] {
    return this.sections.map((s) => s.end);
  }

  onSaveSplit() {
    console.log('Section Names:', this.sectionNames);
    console.log('Start Pages:', this.sectionStartPages);
    console.log('End Pages:', this.sectionEndPages);
  }

  tempResData: any = null;
  tempSections: { start: number; end?: number; name: string }[] = [];

  ngOnInit(): void {
    const folderPath =
      'C:/Users/ajink/OneDrive/Desktop/file-splitter/src/assets/documents';
    this.sendFolderPath(folderPath);
  }

  sendFolderPath(folderPath: string) {
    const payload = { folder_path: folderPath };
    this.isLoading = true;

    this.http.post('http://localhost:5000/process', payload).subscribe({
      next: (response) => {
        this.isLoading = false;
        console.log('API Success:', response);
        this.tempResData = response;

        if (this.tempResData?.output_files) {
          console.log(
            'Received tempResData output files:',
            this.tempResData.output_files
          );

          this.tempSections = this.tempResData.output_files.map((f: any) => {
            const path = f.path;
            const fileName =
              path
                .split(/[\\/]/)
                .pop()
                ?.replace(/\.pdf$/, '') || '';

            // Extract possible page numbers from name (like _7 or _7-10 or space-separated)
            const pageMatch = fileName.match(/(?:_| )(\d+)(?:[-_](\d+))?$/);
            const startPage = pageMatch ? parseInt(pageMatch[1], 10) : null;
            const endPage = pageMatch?.[2]
              ? parseInt(pageMatch[2], 10)
              : startPage;

            // Step 1: Remove the trailing _page or _page-range from filename
            const cleaned = fileName.replace(/(_|\s)\d+([-_\d]*)$/, '');

            // Step 2: Remove boilerplate prefixes like Mohan R BGV Doc etc
            const parts = cleaned.split(/[_\s]+/);
            const keywordsToDrop = ['mohan', 'r', 'bgv', 'doc'];
            const nameParts = parts.filter(
              (p: any) => !keywordsToDrop.includes(p.toLowerCase())
            );
            const finalName = nameParts.join('-');

            // Handle fallback if page numbers weren't found in name
            const pageStart = f.start_page ?? startPage ?? 1;
            const pageEnd =
              f.is_multipage && f.end_page
                ? f.end_page
                : f.start_page ?? endPage ?? startPage ?? 1;

            return {
              start: pageStart,
              end: pageEnd,
              name: finalName.trim(),
            };
          });
        }
      },
      error: (error) => {
        this.isLoading = false;
        console.error('API Error:', error);
      },
    });
  }

  isLoading: boolean = false;
}
