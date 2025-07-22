import { Component } from '@angular/core';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import { SplitReviewer } from './split-reviewer/split-reviewer';

@Component({
  selector: 'app-root',
  imports: [PdfViewerModule, SplitReviewer],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected title = 'file-splitter';
}
