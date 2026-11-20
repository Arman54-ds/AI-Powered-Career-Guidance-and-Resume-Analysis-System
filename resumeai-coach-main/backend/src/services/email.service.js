import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendEmail = async (options) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || '"AI Resume Coach" <noreply@airesumecoach.com>',
      to: options.email,
      subject: options.subject,
      text: options.message,
      html: options.html,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't throw to prevent breaking the flow if email fails in dev, but in prod you might want to
    if (process.env.NODE_ENV === 'production') {
       throw new Error('Email could not be sent');
    }
  }
};
