// macOS, no third-party dependencies. H.264 demo slides match the indexed transcripts.
#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>

static void drawText(NSString *text, NSRect rect, CGFloat size, NSColor *color, BOOL bold) {
    NSMutableParagraphStyle *paragraph = [NSMutableParagraphStyle new];
    paragraph.lineSpacing = 9;
    [text drawInRect:rect withAttributes:@{
        NSFontAttributeName: bold ? [NSFont boldSystemFontOfSize:size] : [NSFont systemFontOfSize:size],
        NSForegroundColorAttributeName: color,
        NSParagraphStyleAttributeName: paragraph
    }];
}

static CVPixelBufferRef renderFrame(NSDictionary *lecture, int second) {
    CVPixelBufferRef pixel = NULL;
    NSDictionary *attributes = @{(NSString *)kCVPixelBufferCGImageCompatibilityKey: @YES,
        (NSString *)kCVPixelBufferCGBitmapContextCompatibilityKey: @YES};
    CVReturn result = CVPixelBufferCreate(kCFAllocatorDefault, 900, 506, kCVPixelFormatType_32ARGB,
        (__bridge CFDictionaryRef)attributes, &pixel);
    if (result != kCVReturnSuccess) return NULL;
    CVPixelBufferLockBaseAddress(pixel, 0);
    CGColorSpaceRef colors = CGColorSpaceCreateDeviceRGB();
    CGContextRef context = CGBitmapContextCreate(CVPixelBufferGetBaseAddress(pixel), 900, 506, 8,
        CVPixelBufferGetBytesPerRow(pixel), colors, kCGImageAlphaNoneSkipFirst);
    CGColorSpaceRelease(colors);
    if (!context) { CVPixelBufferUnlockBaseAddress(pixel, 0); CVPixelBufferRelease(pixel); return NULL; }
    CGContextSetRGBFillColor(context, .055, .086, .16, 1);
    CGContextFillRect(context, CGRectMake(0, 0, 900, 506));
    CGContextTranslateCTM(context, 0, 506); CGContextScaleCTM(context, 1, -1);
    [NSGraphicsContext saveGraphicsState];
    [NSGraphicsContext setCurrentContext:[NSGraphicsContext graphicsContextWithCGContext:context flipped:YES]];
    NSDictionary *segment = [lecture[@"segments"] firstObject];
    for (NSDictionary *candidate in lecture[@"segments"]) {
        if (second >= [candidate[@"start"] doubleValue] && second < [candidate[@"end"] doubleValue]) { segment = candidate; break; }
    }
    NSColor *white = [NSColor colorWithWhite:.96 alpha:1];
    NSColor *accent = [NSColor colorWithRed:.49 green:.75 blue:1 alpha:1];
    drawText(@"VISCON  /  SYNTHETISCHE LERNDEMO", NSMakeRect(48, 28, 804, 25), 15, accent, YES);
    drawText(lecture[@"title"], NSMakeRect(48, 72, 804, 42), 28, white, YES);
    drawText(segment[@"title"], NSMakeRect(48, 142, 804, 42), 24, accent, YES);
    drawText(segment[@"transcript"], NSMakeRect(48, 205, 804, 225), 22, white, NO);
    drawText([NSString stringWithFormat:@"%02d:%02d / 01:30   ·   Keine ETH-Aufzeichnung · Stummes Demo-Video", second / 60, second % 60],
        NSMakeRect(48, 457, 804, 28), 15, [NSColor colorWithWhite:.65 alpha:1], NO);
    CGContextSetRGBFillColor(context, .49, .75, 1, 1);
    CGContextFillRect(context, CGRectMake(48, 493, 804 * (second + 1) / [lecture[@"duration"] doubleValue], 3));
    [NSGraphicsContext restoreGraphicsState]; CGContextRelease(context); CVPixelBufferUnlockBaseAddress(pixel, 0);
    return pixel;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 3) { fprintf(stderr, "Usage: generate-demo-videos catalog.json media-directory\n"); return 1; }
        NSError *error = nil;
        NSData *data = [NSData dataWithContentsOfFile:[NSString stringWithUTF8String:argv[1]] options:0 error:&error];
        NSDictionary *catalog = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:&error] : nil;
        if (!catalog) { NSLog(@"%@", error); return 1; }
        NSURL *directory = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[2]] isDirectory:YES];
        if (![[NSFileManager defaultManager] createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:&error]) { NSLog(@"%@", error); return 1; }
        for (NSDictionary *lecture in catalog[@"lectures"]) {
            NSURL *destination = [directory URLByAppendingPathComponent:[lecture[@"id"] stringByAppendingString:@".mp4"]];
            NSDictionary *fileInfo = [[NSFileManager defaultManager] attributesOfItemAtPath:destination.path error:nil];
            if ([fileInfo fileSize] > 1024) { NSLog(@"Vorhanden: %@", destination.lastPathComponent); continue; }
            NSURL *temporary = [directory URLByAppendingPathComponent:[NSString stringWithFormat:@"%@-%d.tmp.mp4", lecture[@"id"], getpid()]];
            AVAssetWriter *writer = [[AVAssetWriter alloc] initWithURL:temporary fileType:AVFileTypeMPEG4 error:&error];
            if (!writer) { NSLog(@"%@", error); return 1; }
            writer.shouldOptimizeForNetworkUse = YES;
            AVAssetWriterInput *input = [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeVideo outputSettings:@{
                AVVideoCodecKey: AVVideoCodecTypeH264, AVVideoWidthKey: @900, AVVideoHeightKey: @506,
                AVVideoCompressionPropertiesKey: @{AVVideoAverageBitRateKey: @400000, AVVideoExpectedSourceFrameRateKey: @1, AVVideoMaxKeyFrameIntervalKey: @1}
            }];
            AVAssetWriterInputPixelBufferAdaptor *adaptor = [AVAssetWriterInputPixelBufferAdaptor assetWriterInputPixelBufferAdaptorWithAssetWriterInput:input sourcePixelBufferAttributes:@{
                (NSString *)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32ARGB),
                (NSString *)kCVPixelBufferWidthKey: @900, (NSString *)kCVPixelBufferHeightKey: @506
            }];
            [writer addInput:input];
            if (![writer startWriting]) { NSLog(@"%@", writer.error); return 1; }
            [writer startSessionAtSourceTime:kCMTimeZero];
            int duration = [lecture[@"duration"] intValue];
            for (int second = 0; second < duration; second++) {
                @autoreleasepool {
                    while (!input.readyForMoreMediaData) {
                        if (writer.status == AVAssetWriterStatusFailed) { NSLog(@"%@", writer.error); return 1; }
                        [NSThread sleepForTimeInterval:.005];
                    }
                    CVPixelBufferRef pixel = renderFrame(lecture, second);
                    if (!pixel || ![adaptor appendPixelBuffer:pixel withPresentationTime:CMTimeMake(second, 1)]) { NSLog(@"%@", writer.error); return 1; }
                    CVPixelBufferRelease(pixel);
                }
            }
            [writer endSessionAtSourceTime:CMTimeMake(duration, 1)]; [input markAsFinished];
            dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
            [writer finishWritingWithCompletionHandler:^{ dispatch_semaphore_signal(semaphore); }];
            dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);
            if (writer.status != AVAssetWriterStatusCompleted) { NSLog(@"%@", writer.error); return 1; }
            if ([[NSFileManager defaultManager] fileExistsAtPath:destination.path]) [[NSFileManager defaultManager] removeItemAtURL:destination error:nil];
            if (![[NSFileManager defaultManager] moveItemAtURL:temporary toURL:destination error:&error]) { NSLog(@"%@", error); return 1; }
            NSLog(@"Erstellt: %@ (%ds)", destination.lastPathComponent, duration);
        }
    }
    return 0;
}
